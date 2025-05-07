# SafeConfigurationFetcher Benchmark Results

## RPC: Gnosis Chain (https://rpc.gnosischain.com)

- **Fetcher – getFullConfiguration**: avg=87.9ms, std=17.5ms, min=72.5ms, max=134.2ms
- **Method 1 – sequential**: avg=1554.6ms, std=243.2ms, min=1243.6ms, max=1892.9ms
- **Method 2 – parallel**: avg=1052.1ms, std=215.1ms, min=815.4ms, max=1521.7ms
- **Method 3 – batched**: avg=84.3ms, std=14.5ms, min=69.6ms, max=116.7ms
- **Method 4 – multicall**: avg=1078.6ms, std=167.2ms, min=905.9ms, max=1412.5ms

# Speculations on Performance
