# International Harbour

**Permissionless, append-only registry for Safe transactions and ECDSA signatures**

International Harbour (implemented by the `SafeInternationalHarbour` contract) provides an on-chain, chain-agnostic store for Safe (multisig) transactions and their signatures. Clients can reconstruct the full multisig payload with only the Safe address, target chain ID, nonce, and owner set—no off-chain indexer required.

## Motivation

Off-chain coordination of Safe transactions (e.g. collecting ECDSA signatures) is brittle without a reliable broadcast and indexing layer. International Harbour solves this by:

- Allowing any EOA to publish a Safe transaction and its signature on-chain.
- Persisting each unique transaction (by its EIP-712 digest) exactly once and appending signatures under signer-specific keys.
- Enabling on-chain lookups and client-side reconstruction of the full payload.

## Key Disclaimers

- **Signature malleability**: The contract does _not_ enforce EIP-2 low-`s`. If two `(r,s,v)` tuples yield the same signer, both are stored; client code must dedupe if needed.
- **Parameter collision**: Transactions are identified _solely_ by `safeTxHash`. In the astronomically unlikely event of a hash collision, the first stored parameters prevail; later submissions are ignored.
- **EOA-only signers**: Only ECDSA signatures from EOAs are supported. Contract-based signers (e.g. ERC-1271) cannot be verified on-chain in a chain-agnostic way.

## Implementation Details

### Data Structures

- **SafeTransaction**: Mirror of Safe’s `SafeTx` struct:

  ```solidity
  struct SafeTransaction {
    address to;
    uint256 value;
    uint8 operation;
    uint256 safeTxGas;
    uint256 baseGas;
    uint256 gasPrice;
    address gasToken;
    address refundReceiver;
    bytes data;
  }
  ```

- **SignatureData**: Storage-optimized ECDSA signature:
  ```solidity
  struct SignatureData {
    bytes32 r;
    bytes32 s;
    bytes32 txHash; // EIP-712 digest
  }
  ```

### Storage Layout

- `mapping(bytes32 => SafeTransaction) private _txDetails;`
- `mapping(address => mapping(address => mapping(uint256 => mapping(uint256 => SignatureData[])))) private _sigData;`

### EIP-712 Hashing

The contract builds:

1. A domain separator: `keccak256(abi.encode(_DOMAIN_TYPEHASH, chainId, safeAddress))`.
2. A struct hash: `keccak256(abi.encode(_SAFE_TX_TYPEHASH, to, value, keccak256(data), operation, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, nonce))`.
3. The final digest: `keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash))`.

### Signature Recovery

- `_recoverSignerAndRS` splits a 65-byte signature into `(r,s,v)` and recovers the signer.
- Supports both EIP-712 and `eth_sign` flows by adjusting for `v > 30`.

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
) external view returns (SignatureData[] memory page, uint256 totalCount);
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

- **Client-side deduplication**: filter out malleable signature variants if needed.
- **Verify parameters**: ensure on-chain-stored parameters match your expected transaction data.
- **Gas budgeting**: the first `enqueueTransaction` stores full parameters (~X gas); subsequent calls only append signatures (~Y gas).

---

For questions or issues, refer to the contract source: `contracts/src/SafeInternationalHarbour.sol`.
