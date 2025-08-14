// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.29;

// ------------------------------------------------------------------
// Data structures
// ------------------------------------------------------------------

/**
 * @dev Storage optimised mirror of the SafeTx struct used by Safe contracts.
 *      Non-optimised version uses uint256 for:
 *      - value
 *      - safeTxGas
 *      - baseGas
 *      - gasPrice
 */
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

/**
 * @dev Minimal, storage-optimised representation of an ECDSA signature.
 */
struct SignatureDataWithTxHashIndex {
    bytes32 r;
    // vs is the compact representation of s and v coming from
    // EIP-2098: https://eips.ethereum.org/EIPS/eip-2098
    bytes32 vs;
    bytes32 txHash; // EIP-712 digest this signature belongs to
}

/**
 * @dev A public encryption key.
 *
 * @custom:field context   An application-defined context. This can be used as a salt in
 *                         deterministic encryption key derivation schemes (for example, it can be
 *                         the `nonce` and `issuedAt` values for a Sign-in with Ethereum signature
 *                         to be used as entropy for deriving an X25519 encryption key pair).
 * @custom:field publicKey The public encryption key. Note that this contract does not enforce any
 *                         specific key format, the only restriction is that the key must fit in 32
 *                         bytes. The reference client implementation uses Curve25519 public keys.
 */
struct EncryptionKey {
    bytes32 context;
    bytes32 publicKey;
}

/**
 * @dev An encrypted Safe transaction registration handle.
 */
struct SafeTransactionRegistrationHandle {
    uint256 blockNumber;
    bytes32 uid;
}
