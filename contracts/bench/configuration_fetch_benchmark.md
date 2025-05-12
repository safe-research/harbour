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

## Motivation & Recommendation

This benchmark was primarily conducted to evaluate the feasibility and performance benefits of a dedicated **Fetcher Smart Contract**. The goal was to determine if such a contract could efficiently aggregate Safe configuration data (owners, threshold, modules, guards, nonce, version) into a single RPC request and EVM call frame.

This approach was hypothesized to be particularly beneficial for scenarios involving a large number of Safes, such as a potential decentralized Safe interface or power users managing numerous, highly customized Safes (the benchmark assumed 20 complex Safes per user). The Fetcher contract aimed to optimize data retrieval by minimizing RPC calls and potentially offering more efficient data encoding compared to standard methods.

However, the benchmark results, combined with typical real-world usage patterns (users generally manage fewer than 20 Safes, often with simpler configurations), led to the following conclusions:

1.  **Batching (Method 3) is Highly Effective:** Simple batched RPC requests proved to be the most performant method in the tested scenario.
2.  **Fetcher Overhead:** While the Fetcher contract (`getFullConfigurationMany`) performed well (second fastest), the benefits for the common use case do not necessarily outweigh the overhead associated with developing, deploying, and maintaining a dedicated smart contract across multiple networks.
3.  **Multicall is a Strong Alternative:** Multicall (Method 4) also provides significant performance gains over sequential calls and is a widely adopted, standard pattern requiring no custom contract deployment.

**Recommendation:**

Although the Fetcher contract may have potential advantages for scenarios involving hundreds or thousands of Safes or where specific encoding efficiencies are critical, the added complexity and maintenance overhead are not justified for the primary target use cases.

Therefore, we recommend utilizing **batched RPC requests (Method 3)** or **Multicall (Method 4)** for fetching Safe configurations, as they offer excellent performance with lower implementation and maintenance costs.
