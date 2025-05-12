import { deepStrictEqual } from "node:assert";
import { performance } from "node:perf_hooks";
import * as ethers from "ethers";
import { JsonRpcProvider } from "ethers";
import * as fs from "node:fs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { ISafe__factory } from "../../contracts/typechain-types/factories/src/utils/SafeConfigurationFetcher.sol/ISafe__factory";
import { SafeConfigurationFetcher__factory } from "../../contracts/typechain-types/factories/src/utils/SafeConfigurationFetcher.sol/SafeConfigurationFetcher__factory";

// Define a type for the basic configuration structure for comparison
type SafeBasicConfig = {
	singleton: string;
	owners: string[];
	threshold: string;
	fallbackHandler: string;
	nonce: string;
	guard: string;
	modules: string[];
};

// Minimal Multicall3 ABI for on-chain batching
const MULTICALL3_ABI = [
	"function aggregate(tuple(address target, bytes callData)[] calls) external payable returns (uint256 blockNumber, bytes[] returnData)",
];

// Hoisted interfaces
const SAFE_IFACE = ISafe__factory.createInterface();

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
		maxIterations: { type: "number", default: 1, describe: "Max iterations for modules pagination" },
		verbose: { type: "boolean", default: false, describe: "Enable verbose logging" },
	})
	.parseSync();

// Re-added constants needed by fetchModulesSequential and individual calls
const ZERO = ethers.ZeroAddress;
const SENTINEL = "0x0000000000000000000000000000000000000001";

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
				console.error("Expected:", JSON.stringify(refResult, null, 2));
				console.error("Got:", JSON.stringify(result, null, 2));
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

// Decode address from 32-byte storage slot result
function decodeAddressFromSlot(slotData: string): string {
	return ethers.getAddress(ethers.dataSlice(slotData, 12));
}

// Method 1: Fetch data sequentially using individual eth_calls per Safe
async function method1SequentialIndividual(safeAddresses: string[]): Promise<SafeBasicConfig[]> {
	const results: SafeBasicConfig[] = [];
	for (const safeAddress of safeAddresses) {
		const safeContract = ISafe__factory.connect(safeAddress, provider);

		// Make individual sequential calls for this Safe
		const owners = await safeContract.getOwners();
		const thresholdBN = await safeContract.getThreshold();
		const fallbackHandlerBytes = await safeContract.getStorageAt(FALLBACK_SLOT, 1);
		const nonceBN = await safeContract.nonce();
		const guardBytes = await safeContract.getStorageAt(GUARD_SLOT, 1);
		const singletonBytes = await safeContract.getStorageAt(SINGLETON_SLOT, 1);

		// Fetch modules for this safe
		const { modules, nextCursor } = await fetchModulesSequential(
			(cursor) => safeContract.getModulesPaginated(cursor, argv.pageSize),
			argv.maxIterations,
			argv.pageSize,
		);
		if (nextCursor !== ZERO && argv.verbose)
			console.warn(`method1SequentialIndividual: pagination truncated for ${safeAddress}; nextCursor=${nextCursor}`);

		results.push({
			singleton: decodeAddressFromSlot(singletonBytes),
			owners,
			threshold: thresholdBN.toString(),
			fallbackHandler: decodeAddressFromSlot(fallbackHandlerBytes),
			nonce: nonceBN.toString(),
			guard: decodeAddressFromSlot(guardBytes),
			modules,
		});
	}
	return results;
}

// Method 2: Fetch data using parallel individual eth_calls per Safe
async function method2ParallelIndividual(safeAddresses: string[]): Promise<SafeBasicConfig[]> {
	const results: SafeBasicConfig[] = [];
	for (const safeAddress of safeAddresses) {
		const safeContract = ISafe__factory.connect(safeAddress, provider);

		// Fetch basic data in parallel
		const [owners, thresholdBN, fallbackHandlerBytes, nonceBN, guardBytes, singletonBytes] = await Promise.all([
			safeContract.getOwners(),
			safeContract.getThreshold(),
			safeContract.getStorageAt(FALLBACK_SLOT, 1),
			safeContract.nonce(),
			safeContract.getStorageAt(GUARD_SLOT, 1),
			safeContract.getStorageAt(SINGLETON_SLOT, 1),
		]);

		// Fetch modules sequentially after parallel calls complete
		const { modules, nextCursor } = await fetchModulesSequential(
			(cursor) => safeContract.getModulesPaginated(cursor, argv.pageSize),
			argv.maxIterations,
			argv.pageSize,
		);
		if (nextCursor !== ZERO && argv.verbose)
			console.warn(`method2ParallelIndividual: pagination truncated for ${safeAddress}; nextCursor=${nextCursor}`);

		results.push({
			singleton: decodeAddressFromSlot(singletonBytes),
			owners,
			threshold: thresholdBN.toString(),
			fallbackHandler: decodeAddressFromSlot(fallbackHandlerBytes),
			nonce: nonceBN.toString(),
			guard: decodeAddressFromSlot(guardBytes),
			modules,
		});
	}
	return results;
}

// Method 3: Fetch data using batched JSON-RPC calls per Safe
async function method3BatchedIndividual(safeAddresses: string[]): Promise<SafeBasicConfig[]> {
	const rpcUrl = argv.rpcUrl;
	const sendBatch = async (requests: any[]): Promise<any[]> => {
		const response = await fetch(rpcUrl, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(requests),
		});
		if (!response.ok) {
			throw new Error(`Batch request failed with status ${response.status}: ${await response.text()}`);
		}
		const json = await response.json();
		if (!Array.isArray(json)) {
			if (json.error) {
				throw new Error(`Batch request failed: ${json.error.message} (Code: ${json.error.code})`);
			}
			throw new Error(`Unexpected batch response format: ${JSON.stringify(json)}`);
		}
		return json;
	};

	const results: SafeBasicConfig[] = [];
	for (const safeAddress of safeAddresses) {
		// Prepare batch requests for individual calls on this specific Safe
		const calls = [
			{ method: "getOwners", args: [] },
			{ method: "getThreshold", args: [] },
			{ method: "getStorageAt", args: [FALLBACK_SLOT, 1] },
			{ method: "nonce", args: [] },
			{ method: "getStorageAt", args: [GUARD_SLOT, 1] },
			{ method: "getStorageAt", args: [SINGLETON_SLOT, 1] },
			{ method: "getModulesPaginated", args: [SENTINEL, argv.pageSize] }, // Only first page
		] as const;

		// Encode call data explicitly outside the map to satisfy TypeScript
		const callData = [
			SAFE_IFACE.encodeFunctionData("getOwners"),
			SAFE_IFACE.encodeFunctionData("getThreshold"),
			SAFE_IFACE.encodeFunctionData("getStorageAt", [FALLBACK_SLOT, 1]),
			SAFE_IFACE.encodeFunctionData("nonce"),
			SAFE_IFACE.encodeFunctionData("getStorageAt", [GUARD_SLOT, 1]),
			SAFE_IFACE.encodeFunctionData("getStorageAt", [SINGLETON_SLOT, 1]),
			SAFE_IFACE.encodeFunctionData("getModulesPaginated", [SENTINEL, argv.pageSize]),
		];

		const batchRequests = calls.map((_, index) => ({
			jsonrpc: "2.0",
			id: index + 1,
			method: "eth_call",
			params: [
				{
					to: safeAddress, // Target the specific Safe
					data: callData[index], // Use pre-encoded data
				},
				"latest",
			],
		}));

		const batchResponses = await sendBatch(batchRequests);

		// Sort and extract results by request id
		const sorted = batchResponses.sort((a: any, b: any) => a.id - b.id);
		const callResults = sorted.map((resp: any) => {
			if (resp.error) {
				console.error(`Error in batch response for ID ${resp.id} on Safe ${safeAddress}: ${resp.error.message}`);
				throw new Error(`Batch call failed for ${safeAddress}, ID ${resp.id}: ${resp.error.message}`);
			}
			return resp.result;
		});

		// Decode basic config results
		const owners = SAFE_IFACE.decodeFunctionResult("getOwners", callResults[0])[0] as string[];
		const thresholdBN = SAFE_IFACE.decodeFunctionResult("getThreshold", callResults[1])[0] as bigint;
		const fallbackHandlerBytes = callResults[2];
		const nonceBN = SAFE_IFACE.decodeFunctionResult("nonce", callResults[3])[0] as bigint;
		const guardBytes = callResults[4];
		const singletonBytes = callResults[5];

		// Decode first page of modules from batched call
		const [modulePage, nextCursor] = SAFE_IFACE.decodeFunctionResult("getModulesPaginated", callResults[6]);
		const modules = modulePage as string[]; // Only first page

		if (nextCursor !== ZERO && argv.verbose) {
			console.warn(`method3BatchedIndividual: Module pagination truncated for ${safeAddress} (fetched first page only); nextCursor=${nextCursor}`);
		}

		results.push({
			singleton: decodeAddressFromSlot(singletonBytes),
			owners,
			threshold: thresholdBN.toString(),
			fallbackHandler: decodeAddressFromSlot(fallbackHandlerBytes),
			nonce: nonceBN.toString(),
			guard: decodeAddressFromSlot(guardBytes),
			modules,
		});
	}
	return results;
}

// Method 4: Fetch data using on-chain Multicall3 per Safe
async function method4MulticallIndividual(safeAddresses: string[]): Promise<SafeBasicConfig[]> {
	if (!argv.multicall) throw new Error("Multicall3 address is required for this method");
	const multicall = new ethers.Contract(argv.multicall, MULTICALL3_ABI, provider);

	const results: SafeBasicConfig[] = [];
	for (const safeAddress of safeAddresses) {
		// Prepare multicall aggregate for individual calls on this specific Safe
		const calls = [
			{ target: safeAddress, callData: SAFE_IFACE.encodeFunctionData("getOwners") },
			{ target: safeAddress, callData: SAFE_IFACE.encodeFunctionData("getThreshold") },
			{ target: safeAddress, callData: SAFE_IFACE.encodeFunctionData("getStorageAt", [FALLBACK_SLOT, 1]) },
			{ target: safeAddress, callData: SAFE_IFACE.encodeFunctionData("nonce") },
			{ target: safeAddress, callData: SAFE_IFACE.encodeFunctionData("getStorageAt", [GUARD_SLOT, 1]) },
			{ target: safeAddress, callData: SAFE_IFACE.encodeFunctionData("getStorageAt", [SINGLETON_SLOT, 1]) },
			{ target: safeAddress, callData: SAFE_IFACE.encodeFunctionData("getModulesPaginated", [SENTINEL, argv.pageSize]) }, // Only first page
		];

		const [, returnData] = await multicall.aggregate.staticCall(calls);

		// Decode results
		const owners = SAFE_IFACE.decodeFunctionResult("getOwners", returnData[0])[0] as string[];
		const thresholdBN = SAFE_IFACE.decodeFunctionResult("getThreshold", returnData[1])[0] as bigint;
		const fallbackHandlerBytes = returnData[2];
		const nonceBN = SAFE_IFACE.decodeFunctionResult("nonce", returnData[3])[0] as bigint;
		const guardBytes = returnData[4];
		const singletonBytes = returnData[5];
		const [fetchedModules, nextCursorPaginated] = SAFE_IFACE.decodeFunctionResult("getModulesPaginated", returnData[6]);
		const modules = fetchedModules as string[]; // Only first page

		if (nextCursorPaginated !== ZERO && argv.verbose) {
			console.warn(`method4MulticallIndividual: Module pagination truncated for ${safeAddress} (fetched first page only); nextCursor=${nextCursorPaginated}`);
		}

		results.push({
			singleton: decodeAddressFromSlot(singletonBytes),
			owners,
			threshold: thresholdBN.toString(),
			fallbackHandler: decodeAddressFromSlot(fallbackHandlerBytes),
			nonce: nonceBN.toString(),
			guard: decodeAddressFromSlot(guardBytes),
			modules,
		});
	}
	return results;
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
	console.log(`Fetcher contract: ${argv.fetcher}`);
	console.log(`Multicall contract: ${argv.multicall ?? 'Not used'}`);
	console.log(`RPC URL: ${argv.rpcUrl}`);
	console.log(`Runs: ${argv.runs} (Warmups: ${argv.warmups})`);
	console.log(`Module Iterations: ${argv.maxIterations}, Page Size: ${argv.pageSize}`);

	// Benchmark getFullConfigurationMany using the Fetcher contract (as the baseline)
	await runBenchmark("Fetcher – getFullConfigurationMany", () =>
		fetcherContract.getFullConfigurationMany(safeAddresses, argv.maxIterations, argv.pageSize),
	);

	// Benchmark methods using individual calls targeting Safe contracts directly
	await runBenchmark("Method 1 – sequential individual", () => method1SequentialIndividual(safeAddresses));
	await runBenchmark("Method 2 – parallel individual", () => method2ParallelIndividual(safeAddresses));
	await runBenchmark("Method 3 – batched individual", () => method3BatchedIndividual(safeAddresses));
	if (argv.multicall) {
		await runBenchmark("Method 4 – multicall individual", () => method4MulticallIndividual(safeAddresses));
	}
}

main().catch((e) => {
	console.error("Benchmark run failed:", e);
	process.exit(1);
});
