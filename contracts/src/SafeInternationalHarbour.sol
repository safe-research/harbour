// SPDX-License-Identifier: GNU GPLv3
pragma solidity ^0.8.29;

/**
 * @title SafeInternationalHarbour
 * @notice Singleton registry for enqueuing and retrieving Safe Smart Account transactions across any network.
 * @dev
 * Stores lists of transaction data keyed by the signer address derived from the first signature provided,
 * the Safe address, chain ID, and nonce. Multiple transactions can be stored for the same key tuple.
 * This contract stores transaction data and signatures but performs NO validation against Safe contracts.
 * Retrieval requires knowing the signer derived from the first signature, Safe address, chain ID, and nonce.
 */
contract SafeInternationalHarbour {
    error SignaturesTooShort();
    error InvalidSignature();

    // keccak256("EIP712Domain(uint256 chainId,address verifyingContract)")
    bytes32 private constant DOMAIN_SEPARATOR_TYPEHASH =
        0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218;

    // keccak256("SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)")
    bytes32 private constant SAFE_TX_TYPEHASH =
        0xbb8310d486368db6bd6f849402fdd73ad53d316b5a4b2644ad6efe0f941286d8;

    // Storage optimized - fields reordered for efficient packing
    struct SafeTransactionData {
        address to;
        uint256 value;
        uint256 safeTxGas;
        uint256 baseGas;
        uint256 gasPrice;
        address gasToken;
        uint8 operation;
        address refundReceiver;
        bytes data;
        bytes signatures;
    }

    /**
     * @notice Emitted when a new Safe transaction is enqueued in the registry.
     * @param signer Indexed address of the signer derived from the first signature using the internally calculated EIP-712 hash.
     * @param safe Indexed address of the Safe account.
     * @param chainId Indexed chain ID for the transaction.
     * @param nonce Non-indexed nonce of the transaction (multiple transactions can share the same nonce).
     * @param listIndex The index of the newly added transaction within the list for this specific key tuple.
     * @param safeTxHash The hash of the EIP-712 SafeTx struct data (keccak256(abi.encode(SAFE_TX_TYPEHASH, ...))). Provided by client.
     */
    event SafeTransactionEnqueued(
        address indexed signer,
        address indexed safe,
        uint256 indexed chainId,
        uint256 nonce,
        uint256 listIndex,
        bytes32 safeTxHash
    );

    // signerAddress => safeAddress => chainId => nonce => SafeTransactionData[]
    mapping(address => mapping(address => mapping(uint256 => mapping(uint256 => SafeTransactionData[]))))
        public transactions;

    /**
     * @notice Enqueues a Safe transaction after deriving signer from the first signature
     * @return listIndex The index of the newly added transaction in the list
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
        bytes calldata signatures
    ) external returns (uint256 listIndex) {
        if (signatures.length < 65) revert SignaturesTooShort();

        // Calculate EIP-712 hash in one operation to save gas
        bytes32 safeTxHash = keccak256(
            abi.encodePacked(
                bytes1(0x19),
                bytes1(0x01),
                keccak256(
                    abi.encode(DOMAIN_SEPARATOR_TYPEHASH, chainId, safeAddress)
                ),
                keccak256(
                    abi.encode(
                        SAFE_TX_TYPEHASH,
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
                )
            )
        );

        // Extract signer from first signature
        address signerAddress = _recoverSigner(safeTxHash, signatures);

        // Store transaction data
        SafeTransactionData[] storage transactionList = transactions[
            signerAddress
        ][safeAddress][chainId][nonce];

        transactionList.push(
            SafeTransactionData({
                to: to,
                value: value,
                safeTxGas: safeTxGas,
                baseGas: baseGas,
                gasPrice: gasPrice,
                gasToken: gasToken,
                operation: operation,
                refundReceiver: refundReceiver,
                data: data,
                signatures: signatures
            })
        );

        unchecked {
            listIndex = transactionList.length - 1;
        }

        emit SafeTransactionEnqueued(
            signerAddress,
            safeAddress,
            chainId,
            nonce,
            listIndex,
            safeTxHash
        );
    }

    /**
     * @notice Retrieves stored Safe transactions for a specific key tuple
     * @return Array of stored SafeTransactionData (empty if nothing found)
     */
    function retrieveTransaction(
        address signerAddress,
        address safeAddress,
        uint256 chainId,
        uint256 nonce
    ) external view returns (SafeTransactionData[] memory) {
        return transactions[signerAddress][safeAddress][chainId][nonce];
    }

    /**
     * @dev Extracts signer address from the first signature
     */
    function _recoverSigner(
        bytes32 hash,
        bytes calldata signatures
    ) internal view returns (address) {
        address signer;

        // More efficient signature extraction and recovery in a single assembly block
        assembly {
            // Extract r, s, v components from signature
            let r := calldataload(add(signatures.offset, 0x20))
            let s := calldataload(add(signatures.offset, 0x40))
            let v := byte(0, calldataload(add(signatures.offset, 0x60)))

            // Adjust v if needed (EIP-155 handling)
            if lt(v, 27) {
                v := add(v, 27)
            }

            // ecrecover precompile is at address 0x01
            let memPtr := mload(0x40)
            mstore(memPtr, hash)
            mstore(add(memPtr, 32), v)
            mstore(add(memPtr, 64), r)
            mstore(add(memPtr, 96), s)

            // Call ecrecover - 32 bytes input, 32 bytes output
            let success := staticcall(gas(), 1, memPtr, 128, memPtr, 32)

            // Get the address from the result
            signer := mload(memPtr)
        }

        if (signer == address(0)) revert InvalidSignature();
        return signer;
    }
}
