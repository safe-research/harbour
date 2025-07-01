// SPDX-License-Identifier: GNU GPLv3
pragma solidity ^0.8.29;

import "./interfaces/Constants.sol";
import "./interfaces/Errors.sol";
import "./interfaces/Types.sol";
import "./interfaces/Events.sol";
import "./libs/CoreLib.sol";
import "./mixins/ERC4337Mixin.sol";

/**
 * @title SafeInternationalHarbour
 * @notice Permissionless, append‑only registry that lets **any EOA signer** publish Safe
 *         transactions ("SafeTx") and their signatures. Clients without an off‑chain indexer can reconstruct the full multisig payload with only:
 *         1. the Safe address;
 *         2. the target `chainId`;
 *         3. the Safe `nonce`; and
 *         4. the current Safe owners set.
 *
 * Each unique `safeTxHash` (EIP‑712 digest of the SafeTx struct) is persisted **once** together with
 * its parameters. Signatures are appended under the composite key
 * `(signer, safe, chainId, nonce)`, enabling on‑chain, gas‑efficient look‑ups.
 *
 * ### ⚠️ Contract‑based signers unsupported
 * Only ECDSA signatures from externally‑owned accounts (EOAs) are supported. Contract wallets that
 * rely on ERC‑1271 or similar cannot be verified on‑chain in a chain‑agnostic way and are therefore
 * **not supported**.
 *
 * @dev The {SignatureStored} event is the only hook required by indexers; however, the contract is
 *      fully functional without any off‑chain infrastructure.
 */
contract SafeInternationalHarbour is ERC4337Mixin {
    // ------------------------------------------------------------------
    // Storage
    // ------------------------------------------------------------------

    /// Mapping `safeTxHash → SafeTransaction` parameters
    mapping(bytes32 => SafeTransaction) private _txDetails;

    /// Mapping `signer → safe → chainId → nonce → SignatureDataWithTxHashIndex[]`
    /// Stores the list of signatures provided by a signer for a given Safe context.
    /// Note: A single list entry here could contain signatures for *different* `safeTxHash` values
    /// if those transactions share the same (safe, chainId, nonce). Use `_hasSignerSignedTx`
    /// to ensure a signer only signs a specific `safeTxHash` once.
    mapping(address signer => mapping(address safe => mapping(uint256 chainId => mapping(uint256 nonce => SignatureDataWithTxHashIndex[]))))
        private _sigData;

    /// @dev Tracks if a signer has already submitted *any* signature for a specific safeTxHash,
    ///      preventing duplicate signatures for the *exact same* transaction digest.
    ///      This complements `_sigData` by ensuring uniqueness per (safeTxHash, signer) pair.
    /// Mapping `safeTxHash → signer → bool`
    mapping(bytes32 safeTxHash => mapping(address signer => bool))
        private _hasSignerSignedTx;

    constructor(address _entryPoint) ERC4337Mixin(_entryPoint) {}

    // ------------------------------------------------------------------
    // External & public write functions
    // ------------------------------------------------------------------

    /**
     * @notice Publish a Safe transaction and/or append a signature to it.
     *
     * @dev If `safeTxHash` has been seen before, its parameters are *not* validated nor overwritten –
     *      the call simply appends the `(r,s)` pair for `signer`.
     *
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
     * @param signature      **Single** 65‑byte ECDSA signature.
     *
     * @return listIndex     Index of the stored signature in the signer‑specific list.
     *
     * @custom:events Emits {SignatureStored}.
     */
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
    ) external returns (uint256 listIndex) {
        require(signature.length == 65, InvalidECDSASignatureLength());

        // ------------------------------------------------------------------
        // Build the EIP‑712 digest that uniquely identifies the SafeTx
        // ------------------------------------------------------------------
        bytes32 safeTxHash = CoreLib._computeSafeTxHash(
            safeAddress,
            chainId,
            nonce,
            to,
            value,
            data,
            operation,
            safeTxGas,
            baseGas,
            gasPrice,
            gasToken,
            refundReceiver
        );

        (address signer, bytes32 r, bytes32 vs) = CoreLib._recoverSigner(
            safeTxHash,
            signature
        );

        _storeTransaction(
            safeTxHash,
            safeAddress,
            chainId,
            nonce,
            to,
            value,
            data,
            operation,
            safeTxGas,
            baseGas,
            gasPrice,
            gasToken,
            refundReceiver
        );

        // --- DUPLICATE TRANSACTION SIGNATURE CHECK ---
        // Revert if this signer has already submitted *any* signature for this *exact* safeTxHash
        require(
            !_signerSignedTx(safeTxHash, signer),
            SignerAlreadySignedTransaction(signer, safeTxHash)
        );
        return
            _storeSignature(
                signer,
                safeAddress,
                chainId,
                nonce,
                safeTxHash,
                r,
                vs
            );
    }

    // ------------------------------------------------------------------
    // External & public read functions
    // ------------------------------------------------------------------

    /**
     * @notice Retrieve the full parameter set of a Safe transaction.
     *
     * @param safeTxHash EIP‑712 digest of the transaction.
     *
     * @return txParams Struct with all SafeTx parameters (zero‑initialised if unknown).
     */
    function retrieveTransaction(
        bytes32 safeTxHash
    ) external view returns (SafeTransaction memory txParams) {
        txParams = _txDetails[safeTxHash];
    }

    /**
     * @notice Paginated getter for signature entries.
     *
     * @param signerAddress Address that created the signatures.
     * @param safeAddress   Safe Smart‑Account.
     * @param chainId       Target chain id.
     * @param nonce         Safe nonce.
     * @param start         Zero‑based start index of the slice.
     * @param count         Maximum number of entries to return.
     *
     * @return page       Array slice `[start … start+count)` (may be shorter).
     * @return totalCount Total number of signatures stored for the tuple.
     */
    function retrieveSignatures(
        address signerAddress,
        address safeAddress,
        uint256 chainId,
        uint256 nonce,
        uint256 start,
        uint256 count
    )
        external
        view
        returns (SignatureDataWithTxHashIndex[] memory page, uint256 totalCount)
    {
        SignatureDataWithTxHashIndex[] storage all = _sigData[signerAddress][
            safeAddress
        ][chainId][nonce];
        totalCount = all.length;
        if (start >= totalCount)
            return (new SignatureDataWithTxHashIndex[](0), totalCount);

        uint256 end = start + count;
        if (end > totalCount) end = totalCount;
        uint256 len = end - start;

        page = new SignatureDataWithTxHashIndex[](len);
        for (uint256 i; i < len; ++i) {
            page[i] = all[start + i];
        }
    }

    /**
     * @notice Convenience getter returning the **number** of signatures stored for the key tuple.
     *
     * @param signerAddress Signer address.
     * @param safeAddress   Safe Smart‑Account.
     * @param chainId       Target chain id.
     * @param nonce         Safe nonce.
     *
     * @return count Length of the signature list.
     */
    function retrieveSignaturesCount(
        address signerAddress,
        address safeAddress,
        uint256 chainId,
        uint256 nonce
    ) external view returns (uint256 count) {
        count = _sigData[signerAddress][safeAddress][chainId][nonce].length;
    }

    // ------------------------------------------------------------------
    // Internal functions
    // ------------------------------------------------------------------

    /**
     * @dev Internal function to store the transaction data and signature after validation.
     *
     * @param safeTxHash    EIP-712 digest of the transaction.
     * @param signer        Signer address to be checked.
     */
    function _signerSignedTx(
        bytes32 safeTxHash,
        address signer
    ) internal view override returns (bool signed) {
        signed = _hasSignerSignedTx[safeTxHash][signer];
    }

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
    ) internal override {
        // Store parameters only once (idempotent write)
        SafeTransaction storage slot = _txDetails[safeTxHash];
        if (!slot.stored) {
            // first encounter → persist full parameter set
            slot.stored = true;
            slot.to = to;
            slot.operation = operation;

            // Writing to storage is expensive, so we only write if the value is non-zero
            if (value > 0) {
                slot.value = CoreLib._safeCastUint256ToUint128(value);
            }
            if (safeTxGas > 0) {
                slot.safeTxGas = CoreLib._safeCastUint256ToUint128(safeTxGas);
            }
            if (baseGas > 0) {
                slot.baseGas = CoreLib._safeCastUint256ToUint128(baseGas);
            }
            if (gasPrice > 0) {
                slot.gasPrice = CoreLib._safeCastUint256ToUint128(gasPrice);
            }
            if (gasToken != address(0)) {
                slot.gasToken = gasToken;
            }
            if (refundReceiver != address(0)) {
                slot.refundReceiver = refundReceiver;
            }
            if (data.length > 0) {
                slot.data = data;
            }

            emit NewTransaction(
                safeTxHash,
                safeAddress,
                chainId,
                nonce,
                to,
                value,
                operation,
                safeTxGas,
                baseGas,
                gasPrice,
                gasToken,
                refundReceiver,
                data
            );
        }
    }

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
    ) internal override returns (uint256 listIndex) {
        _hasSignerSignedTx[safeTxHash][signer] = true;

        SignatureDataWithTxHashIndex[] storage list = _sigData[signer][
            safeAddress
        ][chainId][nonce];
        listIndex = list.length;

        list.push(
            SignatureDataWithTxHashIndex({r: r, vs: vs, txHash: safeTxHash})
        );

        emit SignatureStored(
            signer,
            safeAddress,
            safeTxHash,
            chainId,
            nonce,
            listIndex
        );
    }
}
