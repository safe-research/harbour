// // SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.29;

import {
    InvalidECDSASignatureLength,
    SignerAlreadySignedTransaction
} from "./interfaces/Errors.sol";
import {
    SafeTransaction,
    SignatureDataWithTxHashIndex
} from "./interfaces/Types.sol";
import {SignatureStored, NewTransaction} from "./interfaces/Events.sol";
import {CoreLib} from "./libs/CoreLib.sol";
import {ERC4337Mixin, ERC4337MixinConfig} from "./mixins/ERC4337Mixin.sol";

/**
 * @title SafeInternationalHarbour
 * @notice Permissionless, append-only registry that lets **any EOA signer** publish Safe
 *         transactions ("SafeTx") and their signatures. Clients without an off-chain indexer can reconstruct the full multisig payload with only:
 *         1. the Safe address;
 *         2. the target `chainId`;
 *         3. the Safe `nonce`; and
 *         4. the current Safe owners set.
 *
 * Each unique `safeTxHash` (EIP-712 digest of the SafeTx struct) is persisted **once** together with
 * its parameters. Signatures are appended under the composite key
 * `(signer, safe, chainId, nonce)`, enabling on-chain, gas-efficient look-ups.
 *
 * ### ⚠️ Contract-based signers unsupported
 * Only ECDSA signatures from externally-owned accounts (EOAs) are supported. Contract wallets that
 * rely on ERC-1271 or similar cannot be verified on-chain in a chain-agnostic way and are therefore
 * **not supported**.
 *
 * @dev The {SignatureStored} event is the only hook required by indexers; however, the contract is
 *      fully functional without any off-chain infrastructure.
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

    struct SignatureData {
        bytes32 r;
        bytes32 vs;
    }
    mapping(address signer => mapping(address safe => mapping(uint256 chainId => mapping(uint256 nonce => SignatureData[]))))
        private _sigData;

    mapping(bytes32 signatureHash => bytes32 safeTxHash) private _signatureLink;

    constructor(
        ERC4337MixinConfig memory _erc4337Mixinconfig
    ) ERC4337Mixin(_erc4337Mixinconfig) {}

    // ------------------------------------------------------------------
    // External & public write functions
    // ------------------------------------------------------------------

    /**
     * @notice Publish a Safe transaction and/or append a signature to it.
     *
     * @dev If `safeTxHash` has been seen before, its parameters are *not* validated nor overwritten –
     *      the call simply appends the `(r,s)` pair for `signer`.
     *
     * @param safeAddress    Target Safe Smart-Account.
     * @param chainId        Chain id the transaction is meant for.
     * @param nonce          Safe nonce.
     * @param to             Destination of the inner call/delegatecall.
     * @param value          ETH value forwarded by the Safe.
     * @param data           Calldata executed by the Safe.
     * @param operation      0 = CALL, 1 = DELEGATECALL.
     * @param safeTxGas      Gas forwarded to the inner call.
     * @param baseGas        Fixed overhead reimbursed to the submitting signer.
     * @param gasPrice       Gas price used for reimbursement.
     * @param gasToken       ERC-20 token address for refunds (`address(0)` = ETH).
     * @param refundReceiver Address receiving the gas refund.
     * @param signature      **Single** 65-byte ECDSA signature.
     *
     * @return listIndex     Index of the stored signature in the signer-specific list.
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
        // Build the EIP-712 digest that uniquely identifies the SafeTx
        // ------------------------------------------------------------------
        bytes32 safeTxHash = CoreLib.computeSafeTxHash(
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

        (address signer, bytes32 r, bytes32 vs) = CoreLib.recoverSigner(
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
            !_signerSignedTx(keccak256(abi.encodePacked(r, vs))),
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
     * @param safeTxHash EIP-712 digest of the transaction.
     *
     * @return txParams Struct with all SafeTx parameters (zero-initialised if unknown).
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
     * @param safeAddress   Safe Smart-Account.
     * @param chainId       Target chain id.
     * @param nonce         Safe nonce.
     * @param start         Zero-based start index of the slice.
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
        SignatureData[] storage all = _sigData[signerAddress][safeAddress][
            chainId
        ][nonce];
        totalCount = all.length;
        if (start >= totalCount)
            return (new SignatureDataWithTxHashIndex[](0), totalCount);

        uint256 end = start + count;
        if (end > totalCount) end = totalCount;
        uint256 len = end - start;

        page = new SignatureDataWithTxHashIndex[](len);
        for (uint256 i; i < len; ++i) {
            bytes32 r = all[start + i].r;
            bytes32 vs = all[start + i].vs;
            page[i] = SignatureDataWithTxHashIndex({
                r: r,
                vs: vs,
                txHash: _signatureLink[keccak256(abi.encodePacked(r, vs))]
            });
        }
    }

    /**
     * @notice Convenience getter returning the **number** of signatures stored for the key tuple.
     *
     * @param signerAddress Signer address.
     * @param safeAddress   Safe Smart-Account.
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
     * @param signatureHash    EIP-712 digest of the transaction.
     */
    function _signerSignedTx(
        bytes32 signatureHash
    ) internal view override returns (bool signed) {
        signed = _signatureLink[signatureHash] != 0;
    }

    /**
     * @dev Internal function to store the transaction data and signature after validation.
     *
     * @param safeTxHash     EIP-712 digest of the transaction.
     * @param safeAddress    Target Safe Smart-Account.
     * @param chainId        Chain id the transaction is meant for.
     * @param nonce          Safe nonce.
     * @param to             Destination of the inner call/delegatecall.
     * @param value          ETH value forwarded by the Safe.
     * @param data           Calldata executed by the Safe.
     * @param operation      0 = CALL, 1 = DELEGATECALL.
     * @param safeTxGas      Gas forwarded to the inner call.
     * @param baseGas        Fixed overhead reimbursed to the submitting signer.
     * @param gasPrice       Gas price used for reimbursement.
     * @param gasToken       ERC-20 token address for refunds (`address(0)` = ETH).
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
                slot.value = CoreLib.safeCastUint256ToUint128(value);
            }
            if (safeTxGas > 0) {
                slot.safeTxGas = CoreLib.safeCastUint256ToUint128(safeTxGas);
            }
            if (baseGas > 0) {
                slot.baseGas = CoreLib.safeCastUint256ToUint128(baseGas);
            }
            if (gasPrice > 0) {
                slot.gasPrice = CoreLib.safeCastUint256ToUint128(gasPrice);
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
        _signatureLink[keccak256(abi.encodePacked(r, vs))] = safeTxHash;

        SignatureData[] storage list = _sigData[signer][safeAddress][chainId][
            nonce
        ];
        listIndex = list.length;

        list.push(SignatureData({r: r, vs: vs}));

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
