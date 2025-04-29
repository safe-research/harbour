// SPDX-License-Identifier: GNU GPLv3
pragma solidity ^0.8.29;



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
 * ### ⚠️ Signature‑malleability disclaimer
 * This implementation deliberately **does not** enforce the EIP‑2 "low‑`s`" rule. If two distinct
 * `(r,s,v)` values recover to the same address, *both* will be stored. Client code **must**
 * de‑duplicate if that is undesirable.
 *
 * ### ⚠️ Parameter‑collision disclaimer
 * Transactions are identified **solely** by their `safeTxHash`. Should two *different* parameter
 * sets ever collide (astronomically unlikely) the first stored version prevails; later submissions
 * are silently ignored.
 *
 * ### ⚠️ Contract‑based signers unsupported
 * Only ECDSA signatures from externally‑owned accounts (EOAs) are supported. Contract wallets that
 * rely on ERC‑1271 or similar cannot be verified on‑chain in a chain‑agnostic way and are therefore
 * **not supported**.
 *
 * @dev The {SignatureStored} event is the only hook required by indexers; however, the contract is
 *      fully functional without any off‑chain infrastructure.
 */
contract SafeInternationalHarbour {
    // ------------------------------------------------------------------
    // Errors
    // ------------------------------------------------------------------

    /// Thrown when a signature blob is not exactly 65 bytes.
    error InvalidECDSASignatureLength();

    /// Thrown if `ecrecover` yields `address(0)`.
    error InvalidSignature();

    // ------------------------------------------------------------------
    // Constants
    // ------------------------------------------------------------------

    /// keccak256("EIP712Domain(uint256 chainId,address verifyingContract)")
    bytes32 private constant _DOMAIN_TYPEHASH = 0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218;

    /// keccak256("SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)")
    bytes32 private constant _SAFE_TX_TYPEHASH = 0xbb8310d486368db6bd6f849402fdd73ad53d316b5a4b2644ad6efe0f941286d8;

    // ------------------------------------------------------------------
    // Data structures
    // ------------------------------------------------------------------

    /**
     * @dev Exact mirror of the SafeTx struct used by Safe contracts.
     */
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

    /**
     * @dev Minimal, storage‑optimised representation of an ECDSA signature.
     */
    struct SignatureData {
        bytes32 r;
        bytes32 s;
        bytes32 txHash; // EIP‑712 digest this signature belongs to
    }

    // ------------------------------------------------------------------
    // Storage
    // ------------------------------------------------------------------

    /// Mapping `safeTxHash → SafeTransaction` parameters
    mapping(bytes32 => SafeTransaction) private _txDetails;

    /// Mapping `signer → safe → chainId → nonce → SignatureData[]`
    mapping(address => mapping(address => mapping(uint256 => mapping(uint256 => SignatureData[]))))
        private _sigData;

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

    // ------------------------------------------------------------------
    // External & public functions
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
        if (signature.length != 65) revert InvalidECDSASignatureLength();

        // ------------------------------------------------------------------
        // Build the EIP‑712 digest that uniquely identifies the SafeTx
        // ------------------------------------------------------------------
        bytes32 safeTxHash = _computeSafeTxHash(
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

        // Recover signer and split signature into (r,s)
        (address signer, bytes32 r, bytes32 s) = _recoverSignerAndRS(safeTxHash, signature);

        // Store parameters only once (idempotent write)
        SafeTransaction storage slot = _txDetails[safeTxHash];
        if (slot.to == address(0)) {
            // first encounter → persist full parameter set
            slot.to = to;
            slot.value = value;
            slot.operation = operation;
            slot.safeTxGas = safeTxGas;
            slot.baseGas = baseGas;
            slot.gasPrice = gasPrice;
            slot.gasToken = gasToken;
            slot.refundReceiver = refundReceiver;
            slot.data = data;
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

        // Append the (r,s) pair for this signer
        SignatureData[] storage list = _sigData[signer][safeAddress][chainId][nonce];
        list.push(SignatureData({r: r, s: s, txHash: safeTxHash}));
        unchecked {
            listIndex = list.length - 1; // gas‑free length‑1 because of unchecked
        }

        emit SignatureStored(signer, safeAddress, safeTxHash, chainId, nonce, listIndex);
    }

    /**
     * @notice Retrieve the full parameter set of a Safe transaction.
     *
     * @param safeTxHash EIP‑712 digest of the transaction.
     *
     * @return txParams Struct with all SafeTx parameters (zero‑initialised if unknown).
     */
    function retrieveTransaction(bytes32 safeTxHash)
        external
        view
        returns (SafeTransaction memory txParams)
    {
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
    ) external view returns (SignatureData[] memory page, uint256 totalCount) {
        SignatureData[] storage all = _sigData[signerAddress][safeAddress][chainId][nonce];
        totalCount = all.length;
        if (start >= totalCount) return (new SignatureData[](0), totalCount);

        uint256 end = start + count;
        if (end > totalCount) end = totalCount;
        uint256 len = end - start;

        page = new SignatureData[](len);
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

    /**
     * @notice Computes the unique EIP-712 digest for a SafeTx using the provided parameters and domain.
     * @param safeAddress Address of the target Safe Smart Account.
     * @param chainId Chain ID included in the domain separator.
     * @param nonce Safe transaction nonce.
     * @param to Target address the Safe will call.
     * @param value ETH value to be sent with the call.
     * @param data Call data executed by the Safe.
     * @param operation Operation type: 0 = CALL, 1 = DELEGATECALL.
     * @param safeTxGas Gas limit for the Safe's internal execution.
     * @param baseGas Base gas overhead for reimbursement.
     * @param gasPrice Gas price used for reimbursement calculation.
     * @param gasToken Token address for refunds (0x0 for ETH).
     * @param refundReceiver Address to receive gas refunds.
     * @return safeTxHash Keccak256 digest of the EIP-712 encoded SafeTx.
     */
    function _computeSafeTxHash(
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
    ) private pure returns (bytes32 safeTxHash) {
        bytes32 domainSeparator = keccak256(
            abi.encode(_DOMAIN_TYPEHASH, chainId, safeAddress)
        );
        bytes32 structHash = keccak256(
            abi.encode(
                _SAFE_TX_TYPEHASH,
                to,
                value,
                keccak256(data),
                operation,
                safeTxGas,
                baseGas,
                gasPrice,
                gasToken,
                refundReceiver,
                nonce
            )
        );
        safeTxHash = keccak256(abi.encodePacked("\x19\x01", domainSeparator, structHash));
    }

    /**
     * @notice Splits a 65-byte ECDSA signature into its components and recovers the signer address.
     * @param digest The message or data hash to verify (EIP-712 digest or eth_sign prefixed).
     * @param sig Concatenated 65-byte ECDSA signature (r || s || v).
     * @return signer The address that produced the signature (EOA).
     * @return r First 32 bytes of the ECDSA signature.
     * @return s Second 32 bytes of the ECDSA signature.
     * @dev Supports both EIP-712 and eth_sign flows by detecting v > 30 and applying the Ethereum Signed Message prefix.
     */
    function _recoverSignerAndRS(bytes32 digest, bytes calldata sig)
        private
        pure
        returns (address signer, bytes32 r, bytes32 s)
    {
        uint8 v;
        assembly ("memory-safe") {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 0x20))
            v := byte(0, calldataload(add(sig.offset, 0x40)))
        }
        if (v > 30) {
            digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
            v -= 4;
        }

        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
    }
}
