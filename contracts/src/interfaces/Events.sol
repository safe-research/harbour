// SPDX-License-Identifier: GNU GPLv3
pragma solidity ^0.8.29;

// ------------------------------------------------------------------
// Events
// ------------------------------------------------------------------

/**
 * @notice Emitted whenever a new signature is stored (and possibly the parameters on first sight).
 *
 * @param signer     Address recovered from the provided signature.
 * @param safe       Safe Smart‑Account the transaction targets.
 * @param safeTxHash EIP‑712 hash identifying the SafeTx.
 * @param chainId    Intended execution chain.
 * @param nonce      Safe nonce.
 * @param listIndex  Position of the signature in the signer‑specific array.
 */
event SignatureStored(
    address indexed signer,
    address indexed safe,
    bytes32 indexed safeTxHash,
    uint256 chainId,
    uint256 nonce,
    uint256 listIndex
);

/**
 * @notice Emitted when a transaction is first stored.
 * @param safeTxHash EIP-712 hash identifying the SafeTx.
 * @param safe       Safe Smart-Account the transaction targets.
 * @param chainId    Intended execution chain.
 * @param nonce      Safe nonce.
 * @param to         Destination of the inner call/delegatecall.
 * @param value      ETH value forwarded by the Safe.
 * @param operation  0 = CALL, 1 = DELEGATECALL.
 * @param safeTxGas  Gas forwarded to the inner call.
 * @param baseGas    Fixed overhead reimbursed to the submitting signer.
 * @param gasPrice   Gas price used for reimbursement.
 * @param gasToken   ERC-20 token address for refunds.
 * @param refundReceiver Address receiving the gas refund.
 * @param data       Calldata executed by the Safe.
 */
event NewTransaction(
    bytes32 indexed safeTxHash,
    address indexed safe,
    uint256 indexed chainId,
    uint256 nonce,
    address to,
    uint256 value,
    uint8 operation,
    uint256 safeTxGas,
    uint256 baseGas,
    uint256 gasPrice,
    address gasToken,
    address refundReceiver,
    bytes data
);
