# Safe Configuration Fetch Benchmark Results

## Benchmark Setup

- **Target:** Fetching configuration for 20 Safes
- **Safe Addresses Source:** `contracts/scripts/safeAddresses.json`
- **Fetcher Contract:** `0xF4cAb78fe3cC1C5024F1a74FcD36bF416dFFB558`
- **Multicall Contract:** `0xcA11bde05977b3631167028862bE2a173976CA11`
- **RPC URL:** `http://nethermind-xdai.dappnode:8545`
- **Runs:** 10 (Warmups: 5)
- **Module Iterations:** 1
- **Page Size:** 50

## Results (Average Time)

| Method                              | Average Time (ms) | Std Dev (ms) | Min Time (ms) | Max Time (ms) |
| ----------------------------------- | ----------------- | ------------ | ------------- | ------------- |
| Fetcher – getFullConfigurationMany  | 44.2              | 2.0          | 41.5          | 47.4          |
| Method 1 – sequential individual    | 2921.6            | 36.8         | 2849.5        | 2973.5        |
| Method 2 – parallel across safes    | 94.2              | 5.5          | 86.1          | 104.0         |
| **Method 3 – batched across safes** | **30.2**          | **1.4**      | **28.3**      | **33.3**      |
| Method 4 – multicall across safes   | 75.5              | 6.0          | 70.4          | 92.1          |

**Total Execution Time:** 47.95s

## Conclusion

The benchmark results clearly indicate that **Method 3 (batched across safes)** offers the most efficient way to fetch configurations for multiple Safes, with the lowest average time (30.2ms) and standard deviation.

- The dedicated **Fetcher contract's `getFullConfigurationMany`** method provides the second-best performance (44.2ms).
- **Method 4 (multicall)** and **Method 2 (parallel)** offer significant improvements over sequential fetching but are less performant than batching or the dedicated fetcher contract in this scenario.
- **Method 1 (sequential individual calls)** is significantly slower (2921.6ms) and should be avoided for fetching data for multiple Safes due to its high latency.

For optimal performance when fetching configurations for numerous Safes, the batching approach (Method 3) is recommended. The dedicated Fetcher contract also presents a highly viable and efficient alternative.
