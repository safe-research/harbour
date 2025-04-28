// SPDX-License-Identifier: GNU GPLv3
pragma solidity ^0.8.29;

/**
 * @title SafeInternationalHarbour
 * @notice
 *  Permissionless, append‑only registry that lets **any signer** publish transactions
 *  and their signatures so that clients — without a dedicated indexer — can fetch
 *  everything they need with just:
 *  1. Safe address
 *  2. target chainId
 *  3. Safe nonce
 *  4. the set of Safe owners
 *
 *  Each unique `safeTxHash` (EIP‑712 digest) is stored **once** together with its parameters.  Signatures
 *  are appended under the composite key `(signer, safe, chainId, nonce)` allowing gas‑efficient lookup
 *  directly on‑chain.
 *
 *  ---
 *  ### ⚠️ Signature‑malleability disclaimer
 *  The contract purposefully **does not** enforce the EIP‑2 "low‑`s`" rule.  If two distinct `(r,s,v)`
 *  values recover to the same address, *both* entries will be stored.  Down‑stream clients MUST
 *  de‑duplicate if this is undesirable.
 *
 *  ### ⚠️ Parameter collision disclaimer
 *  Transactions are identified **solely** by their EIP‑712 hash.  If two *different* parameter sets were
 *  ever to collide (extremely unlikely) the first stored version wins; later calls are silently ignored.
 *
 *  ---
 *  ## Typical flow (no indexer)
 *  1. **A signer** calls {enqueueTransaction} with full SafeTx parameters **plus** the signature.
 *  2. The registry stores the parameters (only if unseen) and appends the signature to the signer‑specific
 *     list.
 *  3. **Other signers** submit their signatures – only the `(r,s)` pair is persisted.
 *  4. A client wallet queries {retrieveTransaction} and {retrieveSignatures} using *(safe, chainId, nonce)*
 *     to reconstruct the executable multisig payload.
 *
 *  ---
 *  ### Notes
 *  * Duplicate `(r,s)` pairs are **not** checked on‑chain (≈ cheaper writes).
 *  * `v` is omitted from storage (it is `27`/`28` for `eth_sign` or `EIP‑712`) and can be reconstructed off-chain from canonical `s` values.
 *  * Only ECDSA signatures from externally-owned accounts (EOAs) are supported; contract-based signers (ERC-1271) are not supported since on-chain signature verification cannot be assumed across networks.
 *
 *  @dev The only off‑chain optimisation hook is the {SignatureStored} event; indexers **may** subscribe
 *       but are not required for core functionality.
 */
contract SafeInternationalHarbour {
    // ------------------------------------------------------------------
    // Errors
    // ------------------------------------------------------------------

    error InvalidECDSASignatureLength();
    error InvalidSignature();

    // ------------------------------------------------------------------
    // Constants
    // ------------------------------------------------------------------

    bytes32 private constant _DOMAIN_TYPEHASH = 0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218;
    bytes32 private constant _SAFE_TX_TYPEHASH = 0xbb8310d486368db6bd6f849402fdd73ad53d316b5a4b2644ad6efe0f941286d8;

    // ------------------------------------------------------------------
    // Data structures
    // ------------------------------------------------------------------

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

    struct SignatureData {
        bytes32 r;
        bytes32 s;
        bytes32 txHash;
    }

    // ------------------------------------------------------------------
    // Storage
    // ------------------------------------------------------------------

    mapping(bytes32 => SafeTransaction) private _txDetails; // safeTxHash ⇒ params

    mapping(address => mapping(address => mapping(uint256 => mapping(uint256 => SignatureData[]))))
        private _sigData; // signer ⇒ safe ⇒ chainId ⇒ nonce ⇒ signatures

    // ------------------------------------------------------------------
    // Events
    // ------------------------------------------------------------------

    /**
     * @notice Emitted every time a signature is stored (and possibly the underlying parameters).
     *
     * @dev Three indexed topics: `signer`, `safe`, `safeTxHash` for fast filtering by either actor or tx.
     */
    event SignatureStored(
        address indexed signer,
        address indexed safe,
        bytes32 indexed safeTxHash,
        uint256 chainId,
        uint256 nonce,
        uint256 listIndex
    );

    // ------------------------------------------------------------------
    // External functions
    // ------------------------------------------------------------------

    /**
     * @notice Append a signature (and, if unseen, the transaction parameters) to the registry.
     * @dev If the parameters for `safeTxHash` are already stored, they are **not verified nor overwritten**.
     *      Optimised for signer‑only front‑ends – no indexer required.
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

        // ---------------------------------------------------------------
        // Build EIP‑712 digest for *target* chain / Safe address
        // ---------------------------------------------------------------
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

        // ---------------------------------------------------------------
        // Recover signer & split signature
        // ---------------------------------------------------------------
        (address signer, bytes32 r, bytes32 s) = _recoverSignerAndRS(safeTxHash, signature);

        // ---------------------------------------------------------------
        // Store parameters only on first encounter; ignore thereafter
        // ---------------------------------------------------------------
        SafeTransaction storage slot = _txDetails[safeTxHash];
        if (slot.to == address(0)) {
            slot.to = to;
            slot.value = value;
            slot.operation = operation;
            slot.safeTxGas = safeTxGas;
            slot.baseGas = baseGas;
            slot.gasPrice = gasPrice;
            slot.gasToken = gasToken;
            slot.refundReceiver = refundReceiver;
            slot.data = data;
        }

        // ---------------------------------------------------------------
        // Append signature
        // ---------------------------------------------------------------
        SignatureData[] storage list = _sigData[signer][safeAddress][chainId][nonce];
        list.push(SignatureData({r: r, s: s, txHash: safeTxHash}));
        unchecked {
            listIndex = list.length - 1;
        }

        emit SignatureStored(signer, safeAddress, safeTxHash, chainId, nonce, listIndex);
    }

    // ------------------------------------------------------------------
    // Read‑only helpers
    // ------------------------------------------------------------------

    function retrieveTransaction(bytes32 safeTxHash) external view returns (SafeTransaction memory) {
        return _txDetails[safeTxHash];
    }

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

    function retrieveSignaturesCount(address signerAddress, address safeAddress, uint256 chainId, uint256 nonce) external view returns (uint256) {
        return _sigData[signerAddress][safeAddress][chainId][nonce].length;
    }

    // ------------------------------------------------------------------
    // Internal helpers
    // ------------------------------------------------------------------

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
     * @dev Recover signer **and** split `(r,s)` from a 65‑byte signature.
     */
    function _recoverSignerAndRS(bytes32 digest, bytes calldata sig)
        private
        pure
        returns (address signer, bytes32 r, bytes32 s)
    {
        uint8 v;
        assembly {
            r := calldataload(add(sig.offset, 0x20))
            s := calldataload(add(sig.offset, 0x40))
            v := byte(0, calldataload(add(sig.offset, 0x60)))
        }
        if (v > 30) {
            digest = keccak256(abi.encodePacked("\x19Ethereum Signed Message:\n32", digest));
            v -= 4;
        }
        signer = ecrecover(digest, v, r, s);
        if (signer == address(0)) revert InvalidSignature();
    }
}
