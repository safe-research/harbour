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

// -----------------------------------------------------------------------------
// Shared pool scheduler (copy once, above the two new methods)
// -----------------------------------------------------------------------------
async function runWithPool<T>(
  jobs: (() => Promise<T>)[],
  limit = 20,                  // prompt requirement: ≤ 20 in flight
): Promise<T[]> {
  const results: T[] = new Array(jobs.length);
  let next = 0;
  let active = 0;

  return new Promise((resolve, reject) => {
    const launch = () => {
      // all queued and finished?
      if (next >= jobs.length && active === 0) {
        resolve(results);
        return;
      }
      // fill the pool
      while (active < limit && next < jobs.length) {
        const idx = next++;
        active++;
        jobs[idx]()
          .then((res) => (results[idx] = res))
          .catch(reject)      // first error aborts everything
          .finally(() => {
            active--;
            launch();         // back-fill slots
          });
      }
    };
    launch();
  });
}


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
function decodeAddressFromBytes(slotData: string): string {
	return ethers.AbiCoder.defaultAbiCoder().decode(["address"], slotData)[0];
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
			singleton: decodeAddressFromBytes(singletonBytes),
			owners,
			threshold: thresholdBN.toString(),
			fallbackHandler: decodeAddressFromBytes(fallbackHandlerBytes),
			nonce: nonceBN.toString(),
			guard: decodeAddressFromBytes(guardBytes),
			modules,
		});
	}
	return results;
}

// -----------------------------------------------------------------------------
// Method 2 – parallel *across* Safes, ≤ 20 concurrent fetches, no extra deps
// -----------------------------------------------------------------------------
async function method2ParallelAcrossSafes(
  safeAddresses: string[],
): Promise<SafeBasicConfig[]> {
  const MAX_CONCURRENCY = 20;                     // hard cap from the prompt
  const results: SafeBasicConfig[] = new Array(safeAddresses.length);

  // --- one Safe --------------------------------------------------------------
  async function fetchSafe(idx: number, safeAddress: string): Promise<void> {
    const safeContract = ISafe__factory.connect(safeAddress, provider);

    // in-Safe data: six independent calls fetched concurrently
    const [
      owners,
      thresholdBN,
      fallbackHandlerBytes,
      nonceBN,
      guardBytes,
      singletonBytes,
    ] = await Promise.all([
      safeContract.getOwners(),
      safeContract.getThreshold(),
      safeContract.getStorageAt(FALLBACK_SLOT, 1),
      safeContract.nonce(),
      safeContract.getStorageAt(GUARD_SLOT, 1),
      safeContract.getStorageAt(SINGLETON_SLOT, 1),
    ]);

    // modules pagination keeps its original sequential logic
    const { modules, nextCursor } = await fetchModulesSequential(
      (cursor) => safeContract.getModulesPaginated(cursor, argv.pageSize),
      argv.maxIterations,
      argv.pageSize,
    );
    if (nextCursor !== ZERO && argv.verbose) {
      console.warn(
        `method2ParallelAcrossSafes: pagination truncated for ${safeAddress}; nextCursor=${nextCursor}`,
      );
    }

    results[idx] = {
      singleton: decodeAddressFromBytes(singletonBytes),
      owners,
      threshold: thresholdBN.toString(),
      fallbackHandler: decodeAddressFromBytes(fallbackHandlerBytes),
      nonce: nonceBN.toString(),
      guard: decodeAddressFromBytes(guardBytes),
      modules,
    };
  }

  // --- simple pool scheduler -------------------------------------------------
  let inFlight = 0;
  let nextIndex = 0;

  return new Promise((resolve, reject) => {
    const maybeLaunch = () => {
      // finished?
      if (nextIndex >= safeAddresses.length && inFlight === 0) {
        resolve(results);
        return;
      }
      // spawn until limit reached or no jobs left
      while (inFlight < MAX_CONCURRENCY && nextIndex < safeAddresses.length) {
        const i = nextIndex++;
        inFlight++;
        fetchSafe(i, safeAddresses[i])
          .catch(reject)                 // fail fast on first error
          .finally(() => {
            inFlight--;
            maybeLaunch();               // back-fill the slot we just freed
          });
      }
    };

    maybeLaunch();                        // kick off the first batch
  });
}


// Method 3: Fetch data using batched JSON-RPC calls per Safe
async function method3BatchedAcrossSafes(
  safeAddresses: string[],
): Promise<SafeBasicConfig[]> {
  const rpcUrl = argv.rpcUrl;

  // helper preserved from original implementation
  const sendBatch = async (requests: any[]): Promise<any[]> => {
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requests),
    });
    if (!response.ok) {
      throw new Error(
        `Batch request failed with status ${response.status}: ${await response.text()}`,
      );
    }
    const json = await response.json();
    if (!Array.isArray(json)) {
      if (json.error) {
        throw new Error(
          `Batch request failed: ${json.error.message} (Code: ${json.error.code})`,
        );
      }
      throw new Error(
        `Unexpected batch response format: ${JSON.stringify(json)}`,
      );
    }
    return json;
  };

  // one job per Safe ----------------------------------------------------------
  const jobs = safeAddresses.map((safeAddress) => async () => {
    // ----- identical per-Safe logic (unchanged) ------------------------------
    const calls = [
      { method: "getOwners", args: [] },
      { method: "getThreshold", args: [] },
      { method: "getStorageAt", args: [FALLBACK_SLOT, 1] },
      { method: "nonce", args: [] },
      { method: "getStorageAt", args: [GUARD_SLOT, 1] },
      { method: "getStorageAt", args: [SINGLETON_SLOT, 1] },
      {
        method: "getModulesPaginated",
        args: [SENTINEL, argv.pageSize],
      }, // first page only
    ] as const;

    // pre-encode
    const callData = [
      SAFE_IFACE.encodeFunctionData("getOwners"),
      SAFE_IFACE.encodeFunctionData("getThreshold"),
      SAFE_IFACE.encodeFunctionData("getStorageAt", [FALLBACK_SLOT, 1]),
      SAFE_IFACE.encodeFunctionData("nonce"),
      SAFE_IFACE.encodeFunctionData("getStorageAt", [GUARD_SLOT, 1]),
      SAFE_IFACE.encodeFunctionData("getStorageAt", [SINGLETON_SLOT, 1]),
      SAFE_IFACE.encodeFunctionData("getModulesPaginated", [
        SENTINEL,
        argv.pageSize,
      ]),
    ];

    const batchRequests = calls.map((_, index) => ({
      jsonrpc: "2.0",
      id: index + 1,
      method: "eth_call",
      params: [
        { to: safeAddress, data: callData[index] },
        "latest",
      ],
    }));

    const batchResponses = await sendBatch(batchRequests);

    const sorted = batchResponses.sort(
      (a: any, b: any) => a.id - b.id,
    );
    const callResults = sorted.map((resp: any) => {
      if (resp.error) {
        throw new Error(
          `Batch call failed for ${safeAddress}, ID ${resp.id}: ${resp.error.message}`,
        );
      }
      return resp.result;
    });

    // decode
    const owners = SAFE_IFACE.decodeFunctionResult(
      "getOwners",
      callResults[0],
    )[0] as string[];
    const thresholdBN = SAFE_IFACE.decodeFunctionResult(
      "getThreshold",
      callResults[1],
    )[0] as bigint;
    const fallbackHandlerBytes = callResults[2];
    const nonceBN = SAFE_IFACE.decodeFunctionResult(
      "nonce",
      callResults[3],
    )[0] as bigint;
    const guardBytes = callResults[4];
    const singletonBytes = callResults[5];
    const [modulePage, nextCursor] =
      SAFE_IFACE.decodeFunctionResult(
        "getModulesPaginated",
        callResults[6],
      );
    const modules = modulePage as string[];

    if (nextCursor !== ZERO && argv.verbose) {
      console.warn(
        `method3BatchedAcrossSafes: Module pagination truncated for ${safeAddress}; nextCursor=${nextCursor}`,
      );
    }

    return {
      singleton: decodeAddressFromBytes(singletonBytes),
      owners,
      threshold: thresholdBN.toString(),
      fallbackHandler: decodeAddressFromBytes(fallbackHandlerBytes),
      nonce: nonceBN.toString(),
      guard: decodeAddressFromBytes(guardBytes),
      modules,
    } as SafeBasicConfig;
  });

  // pool scheduler ------------------------------------------------------------
  return runWithPool(jobs);
}


// Method 4: Fetch data using on-chain Multicall3 per Safe
async function method4MulticallAcrossSafes(
  safeAddresses: string[],
): Promise<SafeBasicConfig[]> {
  if (!argv.multicall) {
    throw new Error("Multicall3 address is required for this method");
  }
  const multicall = new ethers.Contract(
    argv.multicall,
    MULTICALL3_ABI,
    provider,
  );

  // one job per Safe ----------------------------------------------------------
  const jobs = safeAddresses.map((safeAddress) => async () => {
    const calls = [
      {
        target: safeAddress,
        callData: SAFE_IFACE.encodeFunctionData("getOwners"),
      },
      {
        target: safeAddress,
        callData: SAFE_IFACE.encodeFunctionData("getThreshold"),
      },
      {
        target: safeAddress,
        callData: SAFE_IFACE.encodeFunctionData("getStorageAt", [
          FALLBACK_SLOT,
          1,
        ]),
      },
      {
        target: safeAddress,
        callData: SAFE_IFACE.encodeFunctionData("nonce"),
      },
      {
        target: safeAddress,
        callData: SAFE_IFACE.encodeFunctionData("getStorageAt", [
          GUARD_SLOT,
          1,
        ]),
      },
      {
        target: safeAddress,
        callData: SAFE_IFACE.encodeFunctionData("getStorageAt", [
          SINGLETON_SLOT,
          1,
        ]),
      },
      {
        target: safeAddress,
        callData: SAFE_IFACE.encodeFunctionData(
          "getModulesPaginated",
          [SENTINEL, argv.pageSize],
        ),
      },
    ];

    const [, returnData] = await multicall.aggregate.staticCall(calls);

    // decode
    const owners = SAFE_IFACE.decodeFunctionResult(
      "getOwners",
      returnData[0],
    )[0] as string[];
    const thresholdBN = SAFE_IFACE.decodeFunctionResult(
      "getThreshold",
      returnData[1],
    )[0] as bigint;
    const fallbackHandlerBytes = returnData[2];
    const nonceBN = SAFE_IFACE.decodeFunctionResult(
      "nonce",
      returnData[3],
    )[0] as bigint;
    const guardBytes = returnData[4];
    const singletonBytes = returnData[5];
    const [modulePage, nextCursorPaginated] =
      SAFE_IFACE.decodeFunctionResult(
        "getModulesPaginated",
        returnData[6],
      );
    const modules = modulePage as string[];

    if (nextCursorPaginated !== ZERO && argv.verbose) {
      console.warn(
        `method4MulticallAcrossSafes: Module pagination truncated for ${safeAddress}; nextCursor=${nextCursorPaginated}`,
      );
    }

    return {
      singleton: decodeAddressFromBytes(singletonBytes),
      owners,
      threshold: thresholdBN.toString(),
      fallbackHandler: decodeAddressFromBytes(fallbackHandlerBytes),
      nonce: nonceBN.toString(),
      guard: decodeAddressFromBytes(guardBytes),
      modules,
    } as SafeBasicConfig;
  });

  // pool scheduler ------------------------------------------------------------
  return runWithPool(jobs);
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
	await runBenchmark("Method 2 – parallel across safes", () => method2ParallelAcrossSafes(safeAddresses));
	await runBenchmark("Method 3 – batched across safes", () => method3BatchedAcrossSafes(safeAddresses));
	if (argv.multicall) {
		await runBenchmark("Method 4 – multicall across safes", () => method4MulticallAcrossSafes(safeAddresses));
	}
}

main().catch((e) => {
	console.error("Benchmark run failed:", e);
	process.exit(1);
});
