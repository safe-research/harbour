import { deepStrictEqual } from "node:assert";
import { performance } from "node:perf_hooks";
import * as ethers from "ethers";
import { JsonRpcProvider } from "ethers";
import * as fs from "node:fs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { SafeConfigurationFetcher__factory } from "../../contracts/typechain-types/factories/src/utils/SafeConfigurationFetcher.sol/SafeConfigurationFetcher__factory";
import { ISafe__factory } from "../../contracts/typechain-types/factories/src/utils/SafeConfigurationFetcher.sol/ISafe__factory";

// Define a type for the basic configuration structure for comparison
type SafeBasicConfig = {
	singleton: string;
	owners: string[];
	threshold: string;
	fallbackHandler: string;
	nonce: string;
	guard: string;
};

// Minimal Multicall3 ABI for on-chain batching
const MULTICALL3_ABI = [
	"function aggregate(tuple(address target, bytes callData)[] calls) external payable returns (uint256 blockNumber, bytes[] returnData)",
];

// Hoisted interface for encoding/decoding Fetcher calls
const FETCHER_IFACE = SafeConfigurationFetcher__factory.createInterface();

const argv = yargs(hideBin(process.argv))
	.options({
		rpcUrl: { type: "string", demandOption: true, describe: "RPC endpoint URL" },
		safeAddressesFile: {
			type: "string",
			default: "contracts/scripts/safeAddresses.json",
			describe: "Path to JSON file containing an array of Safe addresses",
		},
		fetcher: {
			type: "string",
			default: "0xF4cAb78fe3cC1C5024F1a74FcD36bF416dFFB558",
			describe: "Fetcher contract address",
		},
		multicall: {
			type: "string",
			default: "0xcA11bde05977b3631167028862bE2a173976CA11",
			describe: "Multicall3 contract address",
		},
		runs: { type: "number", default: 10, describe: "Number of measured runs" },
		warmups: { type: "number", default: 5, describe: "Number of warm-up runs" },
		pageSize: { type: "number", default: 50, describe: "Page size for modules pagination" },
		maxIterations: { type: "number", default: 1, describe: "Max iterations for modules pagination (used by getFullConfigurationMany)" },
		verbose: { type: "boolean", default: false, describe: "Enable verbose logging" },
	})
	.parseSync();


// Setup providers and contracts
const provider = new JsonRpcProvider(argv.rpcUrl);
const fetcherContract = SafeConfigurationFetcher__factory.connect(argv.fetcher, provider);

// Re-added storage slot constants
const FALLBACK_SLOT = "0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5";
const GUARD_SLOT = "0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8";
const SINGLETON_SLOT = 0; // Assuming singleton is at slot 0

/** Measures one run: returns result and duration in ms */
async function measure<T>(fn: () => Promise<T>): Promise<{ result: T; time: number }> {
	const start = performance.now();
	const result = await fn();
	return { result, time: performance.now() - start };
}

/** Given an array of numbers, computes average and sample standard-deviation */
function stats(times: number[]): { avg: number; std: number } {
	const n = times.length;
	const sum = times.reduce((a, b) => a + b, 0);
	const avg = sum / n;
	const variance = times.reduce((a, b) => a + (b - avg) ** 2, 0) / n;
	return { avg, std: Math.sqrt(variance) };
}

/** Runner that does warmups and measured runs */
async function runBenchmark(label: string, fn: () => Promise<unknown>, warmups = argv.warmups, runs = argv.runs) {
	// Warm-up runs
	for (let i = 0; i < warmups; i++) {
		await fn();
	}
	const times: number[] = [];
	let refResult: unknown;
	// Measured runs with result validation
	for (let i = 0; i < runs; i++) {
		const { result, time } = await measure(fn);
		if (i === 0) {
			refResult = result;
		} else {
			try {
				deepStrictEqual(result, refResult);
			} catch (err) {
				console.error(`${label}: result mismatch on iteration ${i}`);
				throw err;
			}
		}
		times.push(time);
	}
	const { avg, std } = stats(times);
	const min = Math.min(...times);
	const max = Math.max(...times);
	console.log(
		`${label}: avg=${avg.toFixed(1)}ms, std=${std.toFixed(1)}ms, min=${min.toFixed(1)}ms, max=${max.toFixed(1)}ms`,
	);
	return refResult;
}

/** Helper to paginate modules consistently */
async function fetchModulesSequential(
	fetchFn: (cursor: string) => Promise<[string[], string]>,
	maxIterations: number,
	pageSize: number,
): Promise<{ modules: string[]; nextCursor: string }> {
	let cursor = SENTINEL;
	const modules: string[] = [];
	for (let i = 0; i < maxIterations && cursor !== ZERO; i++) {
		const [page, next] = await fetchFn(cursor);
		modules.push(...page);
		cursor = next;
	}
	if (cursor !== ZERO && argv.verbose) {
		console.warn(
			`fetchModulesSequential: pagination truncated after ${maxIterations} iterations; nextCursor=${cursor}`,
		);
	}
	return { modules, nextCursor: cursor };
}

// --- Updated Methods to fetch Basic Config for Multiple Safes ---

// Method 1: Fetch data sequentially using individual eth_calls per Safe
async function method1Sequential(safeAddresses: string[]): Promise<SafeBasicConfig[]> {
	const results: SafeBasicConfig[] = [];
	for (const safeAddress of safeAddresses) {
		// Connect to the specific Safe contract
		const safeContract = ISafe__factory.connect(safeAddress, provider);

		// Make individual sequential calls for this Safe
		const owners = await safeContract.getOwners();
		const thresholdBN = await safeContract.getThreshold();
		const fallbackHandlerBytes = await safeContract.getStorageAt(FALLBACK_SLOT, 1);
		const nonceBN = await safeContract.nonce();
		const guardBytes = await safeContract.getStorageAt(GUARD_SLOT, 1);
		const singletonBytes = await safeContract.getStorageAt(SINGLETON_SLOT, 1);

		// Decode storage slot results (assuming they return address as bytes)
		const fallbackHandler = ethers.getAddress(ethers.dataSlice(fallbackHandlerBytes, 12)); // Extract address from 32 bytes
		const guard = ethers.getAddress(ethers.dataSlice(guardBytes, 12));
		const singleton = ethers.getAddress(ethers.dataSlice(singletonBytes, 12));
		const { modules, nextCursor } = await fetchModulesSequential(
			(cursor) => safeContract.getModulesPaginated(cursor, argv.pageSize),
			argv.maxIterations,
			argv.pageSize,
		);

		results.push({
			singleton,
			owners,
			threshold: thresholdBN.toString(),
			fallbackHandler,
			nonce: nonceBN.toString(),
			guard,
		});
	}
	return results;
}

// Method 2: parallel getFullConfiguration
async function method2Parallel(safeAddresses: string[]): Promise<SafeBasicConfig[]> {
	const promises = safeAddresses.map((safeAddress) =>
		fetcherContract.getFullConfiguration(safeAddress, argv.maxIterations, argv.pageSize)
	);
	const configs = await Promise.all(promises);
	return configs.map(config => ({
		singleton: config.fullConfig.singleton,
		owners: config.fullConfig.owners,
		threshold: config.fullConfig.threshold.toString(),
		fallbackHandler: config.fullConfig.fallbackHandler,
		nonce: config.fullConfig.nonce.toString(),
		guard: config.fullConfig.guard,
	}));
}

// Method 3: batched JSON-RPC calls for getFullConfiguration
async function method3Batched(safeAddresses: string[]): Promise<SafeBasicConfig[]> {
	const rpcUrl = argv.rpcUrl;
	const sendBatch = async (requests: any[]): Promise<any[]> => {
		const response = await fetch(rpcUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(requests),
		});
		const json = await response.json();
		return json;
	};

	// Prepare batch requests for getFullConfiguration for each safe
	const batchRequests = safeAddresses.map((safeAddress, index) => ({
		jsonrpc: "2.0",
		id: index + 1,
		method: "eth_call",
		params: [
			{
				to: argv.fetcher,
				data: FETCHER_IFACE.encodeFunctionData("getFullConfiguration", [safeAddress, argv.maxIterations, argv.pageSize]),
			},
			"latest",
		],
	}));

	const batchResponses = await sendBatch(batchRequests);

	// Sort responses by ID to match input order
	const sorted = batchResponses.sort((a: any, b: any) => a.id - b.id);
	const results = sorted.map((resp: any) => resp.result);

	// Decode results
	return results.map(resultData => {
		// Define the expected struct output type inline
		type SafeConfigStructOutput = {
			singleton: string;
			owners: string[];
			threshold: bigint; // Use bigint as returned by ethers
			fallbackHandler: string;
			nonce: bigint; // Use bigint
			guard: string;
			modules: string[]; // Include modules even if empty for type matching
		};
		const decoded = FETCHER_IFACE.decodeFunctionResult("getFullConfiguration", resultData)[0]; // Use the inline type
		return {
			singleton: decoded.singleton,
			owners: decoded.owners,
			threshold: decoded.threshold.toString(),
			fallbackHandler: decoded.fallbackHandler,
			nonce: decoded.nonce.toString(),
			guard: decoded.guard,
		};
	});
}

// Method 4: on-chain Multicall3 for getFullConfiguration
async function method4Multicall(safeAddresses: string[]): Promise<SafeBasicConfig[]> {
	if (!argv.multicall) throw new Error("Multicall3 address is required for this method");
	const multicall = new ethers.Contract(argv.multicall, MULTICALL3_ABI, provider);

	// Prepare multicall aggregate for getFullConfiguration for each safe
	const calls = safeAddresses.map(safeAddress => ({
		target: argv.fetcher,
		callData: FETCHER_IFACE.encodeFunctionData("getFullConfiguration", [safeAddress, argv.maxIterations, argv.pageSize]),
	}));

	const [, returnData] = await multicall.aggregate.staticCall(calls);

	// Decode results
	return returnData.map((resultData: string) => {
		// Define the expected struct output type inline (or reuse if hoisted)
		type SafeConfigStructOutput = {
			singleton: string;
			owners: string[];
			threshold: bigint;
			fallbackHandler: string;
			nonce: bigint;
			guard: string;
			modules: string[];
		};
		const decoded = FETCHER_IFACE.decodeFunctionResult("getFullConfiguration", resultData)[0] as SafeConfigStructOutput; // Use the inline type
		return {
			singleton: decoded.singleton,
			owners: decoded.owners,
			threshold: decoded.threshold.toString(),
			fallbackHandler: decoded.fallbackHandler,
			nonce: decoded.nonce.toString(),
			guard: decoded.guard,
		};
	});
}

// Main runner
async function main() {
	// Read safe addresses from JSON file
	let safeAddresses: string[] = [];
	try {
		const fileContent = fs.readFileSync(argv.safeAddressesFile, "utf-8");
		safeAddresses = JSON.parse(fileContent);
		if (!Array.isArray(safeAddresses) || !safeAddresses.every(addr => ethers.isAddress(addr))) {
			throw new Error("Invalid JSON file format or content. Expected an array of addresses.");
		}
	} catch (error: any) {
		console.error(`Error reading or parsing safe addresses file '${argv.safeAddressesFile}':`, error.message);
		process.exit(1);
	}

	console.log(`Benchmarking configuration fetch for ${safeAddresses.length} Safes from ${argv.safeAddressesFile}`);

	// Benchmark getFullConfigurationMany using the Fetcher contract
	await runBenchmark("Fetcher – getFullConfigurationMany", () =>
		fetcherContract.getFullConfigurationMany(safeAddresses, argv.maxIterations, argv.pageSize),
	);

	// Benchmark other methods using getFullConfiguration for multiple safes
	await runBenchmark("Method 1 – sequential full", () => method1Sequential(safeAddresses));
	await runBenchmark("Method 2 – parallel full", () => method2Parallel(safeAddresses));
	await runBenchmark("Method 3 – batched full", () => method3Batched(safeAddresses));
	if (argv.multicall) {
		await runBenchmark("Method 4 – multicall full", () => method4Multicall(safeAddresses));
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
