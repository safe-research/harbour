// SPDX-License-Identifier: GNU GPLv3
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
 * @dev Minimal, storage‑optimised representation of an ECDSA signature.
 */
struct SignatureDataWithTxHashIndex {
    bytes32 r;
    // vs is the compact representation of s and v coming from
    // EIP-2098: https://eips.ethereum.org/EIPS/eip-2098
    bytes32 vs;
    bytes32 txHash; // EIP‑712 digest this signature belongs to
}
