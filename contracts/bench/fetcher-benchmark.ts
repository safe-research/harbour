import { deepStrictEqual } from "node:assert";
import { performance } from "node:perf_hooks";
import * as ethers from "ethers";
import { Contract, JsonRpcProvider } from "ethers";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { ISafe__factory } from "../../contracts/typechain-types/factories/src/utils/SafeConfigurationFetcher.sol/ISafe__factory";
import { SafeConfigurationFetcher__factory } from "../../contracts/typechain-types/factories/src/utils/SafeConfigurationFetcher.sol/SafeConfigurationFetcher__factory";

// Minimal Multicall3 ABI for on-chain batching
const MULTICALL3_ABI = [
	"function aggregate(tuple(address target, bytes callData)[] calls) external payable returns (uint256 blockNumber, bytes[] returnData)",
];

// Hoisted interface for encoding/decoding Safe calls
const SAFE_IFACE = ISafe__factory.createInterface();

const argv = yargs(hideBin(process.argv))
	.options({
		rpcUrl: { type: "string", demandOption: true, describe: "RPC endpoint URL" },
		safe: { type: "string", demandOption: true, describe: "Safe contract address" },
		fetcher: {
			type: "string",
			default: "0xE2d5a00B860b07492BA9c06D51a8E31a4E159412",
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

// Zero address constant
const ZERO = ethers.ZeroAddress;

// Setup providers and contracts
const provider = new JsonRpcProvider(argv.rpcUrl);
const safeContract = ISafe__factory.connect(argv.safe, provider);
const fetcherContract = SafeConfigurationFetcher__factory.connect(argv.fetcher, provider);

// Storage slot constants
const FALLBACK_SLOT = "0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5";
const GUARD_SLOT = "0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8";
const SINGLETON_SLOT = 0;
const SENTINEL = "0x0000000000000000000000000000000000000001";

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
}

// Method 1: sequential eth_call
async function method1Sequential(): Promise<{
	singleton: string;
	owners: string[];
	threshold: string;
	fallback: string;
	guard: string;
	nonce: string;
	modules: string[];
}> {
	const owners = await safeContract.getOwners();
	const thresholdBN = await safeContract.getThreshold();
	const fallback = await safeContract.getStorageAt(FALLBACK_SLOT, 1);
	const nonceBN = await safeContract.nonce();
	const guard = await safeContract.getStorageAt(GUARD_SLOT, 1);
	const singleton = await safeContract.getStorageAt(SINGLETON_SLOT, 1);
	const { modules, nextCursor } = await fetchModulesSequential(
		(cursor) => safeContract.getModulesPaginated(cursor, argv.pageSize),
		argv.maxIterations,
		argv.pageSize,
	);
	if (nextCursor !== ZERO && argv.verbose)
		console.warn(`method1Sequential: pagination truncated; nextCursor=${nextCursor}`);
	return {
		singleton,
		owners,
		threshold: thresholdBN.toString(),
		fallback,
		guard,
		nonce: nonceBN.toString(),
		modules,
	};
}

// Method 2: parallel eth_call
async function method2Parallel(): Promise<{
	singleton: string;
	owners: string[];
	threshold: string;
	fallback: string;
	guard: string;
	nonce: string;
	modules: string[];
}> {
	const [owners, thresholdBN, fallback, nonceBN, guard, singleton, { modules, nextCursor }] = await Promise.all([
		safeContract.getOwners(),
		safeContract.getThreshold(),
		safeContract.getStorageAt(FALLBACK_SLOT, 1),
		safeContract.nonce(),
		safeContract.getStorageAt(GUARD_SLOT, 1),
		safeContract.getStorageAt(SINGLETON_SLOT, 1),
		fetchModulesSequential(
			(cursor) => safeContract.getModulesPaginated(cursor, argv.pageSize),
			argv.maxIterations,
			argv.pageSize,
		),
	]);
	if (nextCursor !== ZERO && argv.verbose)
		console.warn(`method2Parallel: pagination truncated; nextCursor=${nextCursor}`);
	return {
		singleton,
		owners,
		threshold: thresholdBN.toString(),
		fallback,
		guard,
		nonce: nonceBN.toString(),
		modules,
	};
}

// Method 3: batched JSON-RPC calls
async function method3Batched(): Promise<{
	singleton: string;
	owners: string[];
	threshold: string;
	fallback: string;
	guard: string;
	nonce: string;
	modules: string[];
}> {
	// Helper to send batch JSON-RPC requests
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

	// Prepare basic config calls
	const calls = [
		{ method: "getOwners", args: [] },
		{ method: "getThreshold", args: [] },
		{ method: "getStorageAt", args: [FALLBACK_SLOT, 1] },
		{ method: "nonce", args: [] },
		{ method: "getStorageAt", args: [GUARD_SLOT, 1] },
		{ method: "getStorageAt", args: [SINGLETON_SLOT, 1] },
		{ method: "getModulesPaginated", args: [SENTINEL, argv.pageSize] },
	] as const;

	const batchRequests = calls.map((call, index) => ({
		jsonrpc: "2.0",
		id: index + 1,
		method: "eth_call",
		params: [
			{
				to: argv.safe,
				// @ts-expect-error idk why this is not working
				data: SAFE_IFACE.encodeFunctionData(call.method, call.args),
			},
			"latest",
		],
	}));

	const batchResponses = await sendBatch(batchRequests);

	// Sort and extract results by request id
	const sorted = batchResponses.sort((a: any, b: any) => a.id - b.id);
	const results = sorted.map((resp: any) => resp.result);

	// Decode basic config results
	const owners = SAFE_IFACE.decodeFunctionResult("getOwners", results[0])[0] as string[];
	const thresholdBN = SAFE_IFACE.decodeFunctionResult("getThreshold", results[1])[0] as bigint;
	const fallback = SAFE_IFACE.decodeFunctionResult("getStorageAt", results[2])[0] as string;
	const nonceBN = SAFE_IFACE.decodeFunctionResult("nonce", results[3])[0] as bigint;
	const guard = SAFE_IFACE.decodeFunctionResult("getStorageAt", results[4])[0] as string;
	const singleton = SAFE_IFACE.decodeFunctionResult("getStorageAt", results[5])[0] as string;

	// Decode first page of modules from batched call
	const [modulePage, nextCursor] = SAFE_IFACE.decodeFunctionResult("getModulesPaginated", results[6]);
	const modules = modulePage as string[];
	if (nextCursor !== ZERO && argv.verbose) {
		console.warn(`method3Batched: first page truncated; nextCursor=${nextCursor}`);
	}

	return {
		singleton,
		owners,
		threshold: thresholdBN.toString(),
		fallback,
		guard,
		nonce: nonceBN.toString(),
		modules,
	};
}

// Method 4: on-chain Multicall3
async function method4Multicall(): Promise<{
	singleton: string;
	owners: string[];
	threshold: string;
	fallback: string;
	guard: string;
	nonce: string;
	modules: string[];
}> {
	if (!argv.multicall) throw new Error("Multicall3 address is required for this method");
	const multicall = new Contract(argv.multicall, MULTICALL3_ABI, provider);
	// Basic config via multicall + decode
	const basicCalls = [
		{ target: argv.safe, callData: SAFE_IFACE.encodeFunctionData("getOwners") },
		{ target: argv.safe, callData: SAFE_IFACE.encodeFunctionData("getThreshold") },
		{ target: argv.safe, callData: SAFE_IFACE.encodeFunctionData("getStorageAt", [FALLBACK_SLOT, 1]) },
		{ target: argv.safe, callData: SAFE_IFACE.encodeFunctionData("nonce") },
		{ target: argv.safe, callData: SAFE_IFACE.encodeFunctionData("getStorageAt", [GUARD_SLOT, 1]) },
		{ target: argv.safe, callData: SAFE_IFACE.encodeFunctionData("getStorageAt", [SINGLETON_SLOT, 1]) },
		{ target: argv.safe, callData: SAFE_IFACE.encodeFunctionData("getModulesPaginated", [SENTINEL, argv.pageSize]) },
	];
	const [, returnData] = await multicall.aggregate.staticCall(basicCalls);
	// Decode for fairness
	const owners = SAFE_IFACE.decodeFunctionResult("getOwners", returnData[0])[0] as string[];
	const thresholdBN = SAFE_IFACE.decodeFunctionResult("getThreshold", returnData[1])[0] as bigint;
	const fallback = SAFE_IFACE.decodeFunctionResult("getStorageAt", returnData[2])[0] as string;
	const nonceBN = SAFE_IFACE.decodeFunctionResult("nonce", returnData[3])[0] as bigint;
	const guard = SAFE_IFACE.decodeFunctionResult("getStorageAt", returnData[4])[0] as string;
	const singleton = SAFE_IFACE.decodeFunctionResult("getStorageAt", returnData[5])[0] as string;
	// Modules pagination via multicall
	const [fetchedModules, nextCursorPaginated] = SAFE_IFACE.decodeFunctionResult("getModulesPaginated", returnData[6]);
	const modules = fetchedModules as string[];

	if (nextCursorPaginated !== SENTINEL && argv.verbose)
		console.warn(
			`method4Multicall: Only first page of modules fetched via multicall; nextCursor=${nextCursorPaginated}`,
		);
	return {
		singleton,
		owners,
		threshold: thresholdBN.toString(),
		fallback,
		guard,
		nonce: nonceBN.toString(),
		modules,
	};
}

// Main runner
async function main() {
	console.log("Benchmarking configuration fetch on Safe:", argv.safe);
	await runBenchmark("Fetcher – getFullConfiguration", () =>
		fetcherContract.getFullConfiguration(argv.safe, argv.maxIterations, argv.pageSize),
	);
	await runBenchmark("Method 1 – sequential", method1Sequential);
	await runBenchmark("Method 2 – parallel", method2Parallel);
	await runBenchmark("Method 3 – batched", method3Batched);
	if (argv.multicall) {
		await runBenchmark("Method 4 – multicall", method4Multicall);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
