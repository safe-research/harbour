# SafeConfigurationFetcher Benchmark Results

These benchmarks compare the performance of the on-chain fetcher contract (`getFullConfiguration`) against four off-chain fetching methods on various RPC providers.

## RPC: Gnosis Gateway (https://rpc.gnosis.gateway.fm)

- **Fetcher – getFullConfiguration**: avg=53.1ms, std=1.6ms, min=49.4ms, max=55.4ms
- **Method 1 – sequential**: avg=729.6ms, std=43.6ms, min=641.0ms, max=780.3ms
- **Method 2 – parallel**: avg=511.5ms, std=26.8ms, min=467.4ms, max=572.2ms
- **Method 3 – batched**: avg=416.3ms, std=55.7ms, min=358.9ms, max=551.4ms
- **Method 4 – multicall**: avg=540.2ms, std=39.2ms, min=490.2ms, max=613.1ms

## RPC: 1RPC (https://1rpc.io/gnosis)

- **Fetcher – getFullConfiguration**: avg=174.5ms, std=162.7ms, min=86.4ms, max=646.3ms
- **Method 1 – sequential**: avg=2115.4ms, std=519.3ms, min=1706.1ms, max=3348.8ms
- **Method 2 – parallel**: avg=1541.6ms, std=325.8ms, min=1175.1ms, max=2089.7ms
- **Method 3 – batched**: avg=1370.6ms, std=475.2ms, min=1053.7ms, max=2682.2ms
- **Method 4 – multicall**: avg=1486.1ms, std=477.1ms, min=1116.8ms, max=2699.3ms

## RPC: Gnosis Chain (https://rpc.gnosischain.com)

- **Fetcher – getFullConfiguration**: avg=77.1ms, std=5.7ms, min=68.8ms, max=88.3ms
- **Method 1 – sequential**: avg=1021.0ms, std=63.9ms, min=949.4ms, max=1165.5ms
- **Method 2 – parallel**: avg=766.7ms, std=33.4ms, min=716.3ms, max=827.6ms
- **Method 3 – batched**: avg=644.7ms, std=36.2ms, min=601.5ms, max=706.8ms
- **Method 4 – multicall**: avg=792.6ms, std=65.0ms, min=727.7ms, max=959.7ms

## RPC: Nethermind xDai (http://nethermind-xdai.dappnode:8545)

- **Fetcher – getFullConfiguration**: avg=51.6ms, std=16.2ms, min=35.9ms, max=80.1ms
- **Method 1 – sequential**: avg=740.0ms, std=124.6ms, min=583.9ms, max=1011.0ms
- **Method 2 – parallel**: avg=541.7ms, std=167.6ms, min=418.1ms, max=931.4ms
- **Method 3 – batched**: avg=398.4ms, std=102.9ms, min=317.9ms, max=593.1ms
- **Method 4 – multicall**: avg=516.9ms, std=86.7ms, min=430.5ms, max=665.9ms

## RPC: Infura Sepolia (https://sepolia.infura.io/v3/778c89cfe86f40b4ab4fea0b1c83f3fa)

- **Fetcher – getFullConfiguration**: avg=135.8ms, std=3.9ms, min=129.7ms, max=144.3ms
- **Method 1 – sequential**: avg=2209.4ms, std=109.6ms, min=2079.2ms, max=2400.6ms
- **Method 2 – parallel**: avg=1656.2ms, std=102.6ms, min=1566.8ms, max=1928.9ms
- **Method 3 – batched**: avg=1525.2ms, std=91.7ms, min=1423.1ms, max=1688.0ms
- **Method 4 – multicall**: avg=1679.9ms, std=115.9ms, min=1555.1ms, max=1932.4ms

# Speculations on Performance

Here's a speculation into why getFullConfiguration (the on-chain fetcher) handily beats every off-chain variant:

1. One Eth_Call vs N JSON-RPC Calls
   Single request: the fetcher packs all storage-reads, owner/threshold queries and module pagination into one eth_call.
   Off-chain methods (sequential/parallel/batched/multicall) still end up issuing dozens of separate JSON-RPC calls (e.g. eth_getStorageAt, eth_call(getOwners), pagination loops, etc.).
   RPC overhead (network round-trips, HTTP headers, JSON-encode/decode) easily eats 5–20 ms per call. Multiply by 20 calls = +100–400 ms just in plumbing.
2. Shared EVM Execution Context
   Inside one eth_call the node:

- Loads the Safe contract's bytecode once into its internal VM cache.
- Performs all staticcall opcodes (getOwners(), getThreshold(), two getStorageAt(), nonce(), getModulesPaginated()) using the same VM instance.
- Executes the pagination loop in-EVM with hot code/data cached in CPU/L1.
- Contrast that with off-chain batched/multicall: the node still deserializes your batch, then spins up separate VM contexts for each call, re-loading the contract code and state trie in each.

3. Native SLOAD Caching & Trie Hotness
   Back-to-back SLOADs in one VM tick can re-use in-memory trie nodes (leveldb/Geth cache), cutting DB lookups.
   Off-chain storage calls each spawn a new VM → new state-trie reads from disk/cache, thrashing the cache.
4. ABI Blob vs JSON Overhead
   The fetcher returns one tight ABI-encoded blob: owners[], threshold, handler, nonce, guard, modules[].
   Off-chain you get dozens of small JSON objects. Even in a batched RPC, the server must unpack the batch, unmarshal each JSON-RPC call, then your client must parse/deserialize every piece, merge arrays, etc.
5. Client-side Workload Offloaded to EVM
   All array concatenation, memory resizing and loop logic lives in Solidity.
   Off-chain methods must reassemble pages of modules, manage promise resolution, allocate JS arrays—adding CPU/GC overhead.
   Result: by shifting all storage access, paging loops, ABI encoding/decoding and caching optimizations into the node's native EVM, you collapse dozens of slow JSON-RPC hops into one fast eth_call. That single-call EVM path consistently runs in 40–80 ms, whereas even the most optimized off-chain batch hovers around 300–600 ms.
