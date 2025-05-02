# International Harbour

**Permissionless, append-only registry for Safe transactions and ECDSA signatures**

International Harbour (implemented by the `SafeInternationalHarbour` contract) provides an on-chain, chain-agnostic store for Safe (multisig) transactions and their signatures. Clients can reconstruct the full multisig payload with only the Safe address, target chain ID, nonce, and owner set—no off-chain indexer required.

## Motivation

Off-chain coordination of Safe transactions (e.g. collecting ECDSA signatures) is brittle without a reliable broadcast and indexing layer. International Harbour solves this by:

- Allowing any EOA to publish a Safe transaction and its signature on-chain.
- Persisting each unique transaction (by its EIP-712 digest) exactly once and appending signatures under signer-specific keys.
- Enabling on-chain lookups and client-side reconstruction of the full payload.

## Key Disclaimers

- **Signature malleability**: The contract enforces EIP-2098 low-`s` values.
- **Parameter collision**: Transactions are identified _solely_ by `safeTxHash`. In the astronomically unlikely event of a hash collision, the first stored parameters prevail; later submissions are ignored.
- **EOA-only signers**: Only ECDSA signatures from EOAs are supported. Contract-based signers (e.g. ERC-1271) cannot be verified on-chain in a chain-agnostic way.

## Implementation Details

### Data Structures

Note: The order of struct variables might differ in the implementation to optimize gas usage.

- **SafeTransaction**: Storage-optimized mirror of the `SafeTx` struct used by Safe contracts:

  ```solidity
  struct SafeTransaction {
      // stored, operation and to will be packed into the same storage slot
      bool stored;
      uint8 operation;
      address to;
      uint128 value;
      uint128 safeTxGas;
      uint128 baseGas;
      uint128 gasPrice;
      address gasToken;
      address refundReceiver;
      bytes data;
  }
  ```

- **SignatureDataWithTxHashIndex**: Minimal, storage-optimized representation of an ECDSA signature linked to a Safe transaction:

  ```solidity
  struct SignatureDataWithTxHashIndex {
      bytes32 r;
      // vs is the compact representation of s and v coming from
      // EIP-2098: https://eips.ethereum.org/EIPS/eip-2098
      bytes32 vs;
      bytes32 txHash; // EIP-712 digest this signature belongs to
  }
  ```

### Storage Layout

- `mapping(bytes32 => SafeTransaction) private _txDetails;`
- `mapping(address signer => mapping(address safe => mapping(uint256 chainId => mapping(uint256 nonce => SignatureDataWithTxHashIndex[])))) private _sigData;`

### EIP-712 Hashing

The contract builds:

1. A domain separator: `keccak256(abi.encode(_DOMAIN_TYPEHASH, chainId, safeAddress))`.
2. A struct hash: `keccak256(abi.encode(_SAFE_TX_TYPEHASH, to, value, keccak256(data), operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, nonce))`.
3. The final digest: `keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash))`.

## API Reference

### enqueueTransaction

```solidity
function enqueueTransaction(
  address safeAddress,
  uint256 chainId,
  uint256 nonce,
  address to,
  uint256 value,
  bytes calldata data,
  uint8 operation,
  uint256 safeTxGas,
  uint256 baseGas,
  uint256 gasPrice,
  address gasToken,
  address refundReceiver,
  bytes calldata signature
) external returns (uint256 listIndex);
```

- **Publishes** a Safe transaction (first call) and **appends** a single 65-byte ECDSA `signature`.
- Reverts if `signature.length != 65` or if `ecrecover` yields `address(0)`.
- Emits `SignatureStored(address signer, address safe, bytes32 safeTxHash, uint256 chainId, uint256 nonce, uint256 listIndex)`.
- Returns the index of the stored signature in the signer-specific array.

### retrieveTransaction

```solidity
function retrieveTransaction(bytes32 safeTxHash)
  external view returns (SafeTransaction memory txParams);
```

- Returns the stored `SafeTransaction` for `safeTxHash` (zero values if unknown).

### retrieveSignatures

```solidity
function retrieveSignatures(
  address signerAddress,
  address safeAddress,
  uint256 chainId,
  uint256 nonce,
  uint256 start,
  uint256 count
) external view returns (SignatureDataWithTxHashIndex[] memory page, uint256 totalCount);
```

- Returns a paginated slice `[start … start+count)` of signatures and the total count.

### retrieveSignaturesCount

```solidity
function retrieveSignaturesCount(
  address signerAddress,
  address safeAddress,
  uint256 chainId,
  uint256 nonce
) external view returns (uint256 count);
```

- Returns the total number of signatures stored for the tuple.

## Best Practices

- **Verify parameters**: ensure on-chain-stored parameters match your expected transaction data.
- **Gas budgeting**: the first `enqueueTransaction` stores full parameters (~X gas); subsequent calls only append signatures (~Y gas).

## Gas Cost Scaling

The gas cost for `enqueueTransaction` grows approximately linearly with the size of the transaction data because each EVM storage slot is 32 bytes. Based on our benchmarks:

- 68 bytes (~3 slots) → ~40k gas.
- 1024 bytes (~32 slots) → ~907k gas.

On average, each extra 32-byte slot adds around ~22k gas.

---

For questions or issues, refer to the contract source: `contracts/src/SafeInternationalHarbour.sol`.

## Potential improvements or areas of future research

- Using [SSTORE2](https://github.com/0xsequence/sstore2) for storing the transaction data
