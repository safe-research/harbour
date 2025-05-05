#!/usr/bin/env ts-node

import { Contract, JsonRpcProvider } from "ethers";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import { ISafe__factory } from "../contracts/typechain-types/factories/src/utils/SafeConfigurationFetcher.sol/ISafe__factory";
import { SafeConfigurationFetcher__factory } from "../contracts/typechain-types/factories/src/utils/SafeConfigurationFetcher.sol/SafeConfigurationFetcher__factory";

// Minimal Multicall3 ABI for on-chain batching
const MULTICALL3_ABI = [
	"function aggregate(tuple(address target, bytes callData)[] calls) external payable returns (uint256 blockNumber, bytes[] returnData)",
];

interface Args {
	rpcUrl: string;
	safe: string;
	fetcher: string;
	multicall?: string;
	runs: number;
	warmups: number;
	pageSize: number;
	maxIterations: number;
}

const argv = yargs(hideBin(process.argv))
	.options({
		rpcUrl: { type: "string", demandOption: true, describe: "RPC endpoint URL" },
		safe: { type: "string", demandOption: true, describe: "Safe contract address" },
		fetcher: { type: "string", demandOption: true, describe: "Fetcher contract address" },
		multicall: { type: "string", demandOption: false, describe: "Multicall3 contract address" },
		runs: { type: "number", default: 10, describe: "Number of measured runs" },
		warmups: { type: "number", default: 5, describe: "Number of warm-up runs" },
		pageSize: { type: "number", default: 50, describe: "Page size for modules pagination" },
		maxIterations: { type: "number", default: 10, describe: "Max iterations for modules pagination" },
	})
	.parseSync() as Args;

// Zero address constant
const ZERO = "0x0000000000000000000000000000000000000000";

// Setup providers and contracts
const provider = new JsonRpcProvider(argv.rpcUrl);
const safeContract = ISafe__factory.connect(argv.safe, provider);
const fetcherContract = SafeConfigurationFetcher__factory.connect(argv.fetcher, provider);

// Storage slot constants
const FALLBACK_SLOT = "0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5";
const GUARD_SLOT = "0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8";
const SENTINEL = "0x0000000000000000000000000000000000000001";

/** Measures one run: returns result and duration in ms */
async function measure<T>(fn: () => Promise<T>): Promise<{ result: T; time: number }> {
	const start = Date.now();
	const result = await fn();
	return { result, time: Date.now() - start };
}

/** Given an array of numbers, computes average and population std-deviation */
function stats(times: number[]): { avg: number; std: number } {
	const n = times.length;
	const sum = times.reduce((a, b) => a + b, 0);
	const avg = sum / n;
	const variance = times.reduce((a, b) => a + (b - avg) ** 2, 0) / n;
	return { avg, std: Math.sqrt(variance) };
}

/** Runner that does warmups and measured runs */
async function runBenchmark(label: string, fn: () => Promise<unknown>, warmups = argv.warmups, runs = argv.runs) {
	for (let i = 0; i < warmups; i++) {
		await fn();
	}
	const times: number[] = [];
	for (let i = 0; i < runs; i++) {
		const { time } = await measure(fn);
		times.push(time);
	}
	const { avg, std } = stats(times);
	console.log(`${label}: avg=${avg.toFixed(1)}ms, std=${std.toFixed(1)}ms`);
}

// Method 1: sequential eth_call
async function method1Sequential() {
	await safeContract.getOwners();
	await safeContract.getThreshold();
	await safeContract.getStorageAt(FALLBACK_SLOT, 1);
	await safeContract.nonce();
	await safeContract.getStorageAt(GUARD_SLOT, 1);
	let cursor = SENTINEL;
	for (let i = 0; i < argv.maxIterations && cursor !== ZERO; i++) {
		const [page, next] = await safeContract.getModulesPaginated(cursor, argv.pageSize);
		cursor = next;
	}
}

// Method 2: parallel eth_call
async function method2Parallel() {
	await Promise.all([
		safeContract.getOwners(),
		safeContract.getThreshold(),
		safeContract.getStorageAt(FALLBACK_SLOT, 1),
		safeContract.nonce(),
		safeContract.getStorageAt(GUARD_SLOT, 1),
	]);
	let cursor = SENTINEL;
	for (let i = 0; i < argv.maxIterations && cursor !== ZERO; i++) {
		const [page, next] = await safeContract.getModulesPaginated(cursor, argv.pageSize);
		cursor = next;
	}
}

// Method 3: batched JSON-RPC calls
async function method3Batched() {
	// Configure JsonRpcProvider with explicit batching options
	const batchProvider = new JsonRpcProvider(argv.rpcUrl, undefined, {
		// Immediately send batch at end of current event loop
		batchStallTime: 0,
		// Maximum number of RPC calls to include in each batch
		batchMaxCount: argv.maxIterations * argv.pageSize + 5,
		// Maximum total size (bytes) per batch payload
		batchMaxSize: 1024 * 1024,
	});
	const iface = ISafe__factory.createInterface();
	const calls = [
		batchProvider.call({ to: argv.safe, data: iface.encodeFunctionData("getOwners") }),
		batchProvider.call({ to: argv.safe, data: iface.encodeFunctionData("getThreshold") }),
		batchProvider.call({ to: argv.safe, data: iface.encodeFunctionData("getStorageAt", [FALLBACK_SLOT, 1]) }),
		batchProvider.call({ to: argv.safe, data: iface.encodeFunctionData("nonce") }),
		batchProvider.call({ to: argv.safe, data: iface.encodeFunctionData("getStorageAt", [GUARD_SLOT, 1]) }),
	];
	await Promise.all(calls);
	let cursor = SENTINEL;
	for (let i = 0; i < argv.maxIterations && cursor !== ZERO; i++) {
		const raw = await batchProvider.call({
			to: argv.safe,
			data: iface.encodeFunctionData("getModulesPaginated", [cursor, argv.pageSize]),
		});
		const [page, next] = iface.decodeFunctionResult("getModulesPaginated", raw);
		cursor = next;
	}
}

// Method 4: on-chain Multicall3
async function method4Multicall() {
	if (!argv.multicall) throw new Error("Multicall3 address is required for this method");
	const multicall = new Contract(argv.multicall, MULTICALL3_ABI, provider);
	const iface = ISafe__factory.createInterface();
	const calls = [
		{ target: argv.safe, callData: iface.encodeFunctionData("getOwners") },
		{ target: argv.safe, callData: iface.encodeFunctionData("getThreshold") },
		{ target: argv.safe, callData: iface.encodeFunctionData("getStorageAt", [FALLBACK_SLOT, 1]) },
		{ target: argv.safe, callData: iface.encodeFunctionData("nonce") },
		{ target: argv.safe, callData: iface.encodeFunctionData("getStorageAt", [GUARD_SLOT, 1]) },
	];
	await multicall.aggregate(calls);
	// Note: modules pagination via multicall could be implemented similarly
}

// Main runner
async function main() {
	console.log("Benchmarking configuration fetch on Safe:", argv.safe);
	await runBenchmark("Method 1 – sequential", method1Sequential);
	await runBenchmark("Method 2 – parallel", method2Parallel);
	await runBenchmark("Method 3 – batched", method3Batched);
	if (argv.multicall) {
		await runBenchmark("Method 4 – multicall", method4Multicall);
	}
	await runBenchmark("Fetcher – getFullConfiguration", () =>
		fetcherContract.getFullConfiguration(argv.safe, argv.maxIterations, argv.pageSize),
	);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
