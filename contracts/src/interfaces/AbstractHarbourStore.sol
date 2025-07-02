// SPDX-License-Identifier: GNU GPLv3
pragma solidity ^0.8.29;

abstract contract IHarbourStore {
    /**
     * @dev Internal function to store the transaction data and signature after validation.
     *
     * @param safeTxHash    EIP-712 digest of the transaction.
     * @param signer        Signer address to be checked.
     */
    function _signerSignedTx(
        bytes32 safeTxHash,
        address signer
    ) internal view virtual returns (bool signed);

    /**
     * @dev Internal function to store a signature after validation.
     *
     * @param signer        Address that signed the transaction.
     * @param safeAddress   Target Safe Smart-Account.
     * @param chainId       Chain id the transaction is meant for.
     * @param nonce         Safe nonce.
     * @param safeTxHash    EIP-712 digest of the transaction.
     * @param r             First 32 bytes of the signature.
     * @param vs            Compact representation of s and v from EIP-2098.
     *
     * @return listIndex    Index of the stored signature in the signer-specific list.
     */
    function _storeSignature(
        address signer,
        address safeAddress,
        uint256 chainId,
        uint256 nonce,
        bytes32 safeTxHash,
        bytes32 r,
        bytes32 vs
    ) internal virtual returns (uint256 listIndex);

    /**
     * @dev Internal function to store the transaction data and signature after validation.
     *
     * @param safeTxHash     EIP-712 digest of the transaction.
     * @param safeAddress    Target Safe Smart‑Account.
     * @param chainId        Chain id the transaction is meant for.
     * @param nonce          Safe nonce.
     * @param to             Destination of the inner call/delegatecall.
     * @param value          ETH value forwarded by the Safe.
     * @param data           Calldata executed by the Safe.
     * @param operation      0 = CALL, 1 = DELEGATECALL.
     * @param safeTxGas      Gas forwarded to the inner call.
     * @param baseGas        Fixed overhead reimbursed to the submitting signer.
     * @param gasPrice       Gas price used for reimbursement.
     * @param gasToken       ERC‑20 token address for refunds (`address(0)` = ETH).
     * @param refundReceiver Address receiving the gas refund.
     */
    function _storeTransaction(
        bytes32 safeTxHash,
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
        address refundReceiver
    ) internal virtual;
}
