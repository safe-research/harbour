// SPDX-License-Identifier: GNU GPLv3
pragma solidity ^0.8.29;

/**
 * @title SafeInternationalHarbour
 * @notice Singleton registry for enqueuing and retrieving Safe Smart Account transactions across any network.
 * @dev
 * Stores lists of transaction data keyed by the signer address derived from the first signature provided,
 * the Safe address, chain ID, and nonce. Multiple transactions can be stored for the same key tuple.
 * Assumes the off-chain client provides correctly formatted signatures corresponding to the EIP-712 hash derived from the transaction details.
 * Signatures bytes must contain at least one valid signature (65 bytes) at the beginning.
 * If multiple signatures are provided concatenated, only the first one is used for deriving the signer key.
 * The contract calculates the EIP-712 hash to sign internally using standard Safe logic based on all transaction parameters.
 * Signer recovery uses the internally calculated EIP-712 hash.
 * This contract stores transaction data and signatures but performs NO validation against Safe contracts (e.g., owner checks).
 * Retrieval requires knowing the signer derived from the first signature, Safe address, chain ID, and nonce.
 * Optimized for efficient querying similar to:
 * SELECT * FROM transactions_list
 * WHERE signer_address = ?
 * AND safe_address = ?
 * AND chain_id = ?
 * AND nonce = ?
 */
contract SafeInternationalHarbour {
    // keccak256("EIP712Domain(uint256 chainId,address verifyingContract)")
    bytes32 private constant DOMAIN_SEPARATOR_TYPEHASH =
        0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218;

    // keccak256("SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)")
    bytes32 private constant SAFE_TX_TYPEHASH =
        0xbb8310d486368db6bd6f849402fdd73ad53d316b5a4b2644ad6efe0f941286d8;

    /**
     * @notice Stores the details of a Safe transaction, excluding the key components (signer, safe, chainId, nonce).
     * @param to The recipient address of the transaction.
     * @param value The Ether value to be sent with the transaction.
     * @param data The data payload of the transaction.
     * @param operation The type of operation (e.g., CALL, DELEGATECALL).
     * @param safeTxGas Gas limit for the transaction execution.
     * @param baseGas Gas paid for data storage and overhead.
     * @param gasPrice Gas price used for the transaction.
     * @param gasToken Token address for gas payment (address(0) for native currency).
     * @param refundReceiver Address to receive gas refunds.
     * @param signatures The raw bytes of the signature(s) provided during enqueueing.
     */
    struct SafeTransactionData {
        address to;
        uint256 value;
        bytes data;
        uint8 operation;
        uint256 safeTxGas;
        uint256 baseGas;
        uint256 gasPrice;
        address gasToken;
        address refundReceiver;
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

    /**
     * @notice Stores lists of enqueued transactions data. Access to the list is O(1) using signer address, safe address, chain ID, and nonce.
     * @dev mapping: signerAddress => safeAddress => chainId => nonce => SafeTransactionData[]
     */
    mapping(address => mapping(address => mapping(uint256 => mapping(uint256 => SafeTransactionData[]))))
        public transactions;

    /**
     * @notice Enqueues a Safe transaction into the registry after deriving a signer from the first signature and calculating the EIP-712 hash internally.
     * @dev Appends the transaction details to the list associated with the key (derived signer, safeAddress, chainId, nonce).
     * Requires signatures length >= 65 bytes.
     * Calculates the EIP-712 hash to sign internally based on all provided transaction parameters and standard Safe logic.
     * Derives signer from the first 65 bytes using ecrecover on the internally calculated EIP-712 hash to sign. Reverts if recovery fails.
     * The provided `safeTxHash` is stored but NO LONGER VERIFIED against the other parameters.
     * Does not validate the derived signer against Safe owners.
     * Callable by any address.
     * @param safeAddress The address of the Safe account.
     * @param chainId The target chain ID.
     * @param nonce The transaction nonce specific to the Safe on the target chain.
     * @param to Recipient address.
     * @param value Ether value.
     * @param data Transaction data payload.
     * @param operation Operation type (0 for CALL, 1 for DELEGATECALL).
     * @param safeTxGas Gas limit for the Safe transaction execution.
     * @param baseGas Gas for overhead.
     * @param gasPrice Gas price.
     * @param gasToken Token for gas payment (address(0) for native currency).
     * @param refundReceiver Gas refund recipient.
     * @param signatures Raw signature bytes (must be >= 65 bytes). The first 65 bytes are used for signer recovery.
     * @return listIndex The index of the newly added transaction in the list for this key tuple.
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
        require(
            signatures.length >= 65,
            "IH: Signatures must be at least 65 bytes"
        );

        bytes32 safeTxHash = _calculateSafeTxHash(
            safeAddress,
            chainId,
            to,
            value,
            data,
            operation,
            safeTxGas,
            baseGas,
            gasPrice,
            gasToken,
            refundReceiver,
            nonce
        );

        // --- Signature Recovery ---
        bytes32 r;
        bytes32 s;
        uint8 v;
        // Assumes signatures are tightly packed
        assembly {
            r := mload(add(signatures.offset, 0x20))
            s := mload(add(signatures.offset, 0x40))
            v := byte(0, mload(add(signatures.offset, 0x60)))
        }

        // Adjust v if needed (standard EIP-155 handling)
        if (v < 27) {
            v += 27;
        }

        // Recover the signer address using the internally calculated EIP-712 hash to sign
        address signerAddress = ecrecover(safeTxHash, v, r, s);
        require(signerAddress != address(0), "IH: Invalid signature");
        // ---------

        // --- Store Transaction Data ---
        SafeTransactionData[] storage transactionList = transactions[
            signerAddress
        ][safeAddress][chainId][nonce];

        transactionList.push(
            SafeTransactionData({
                to: to,
                value: value,
                data: data,
                operation: operation,
                safeTxGas: safeTxGas,
                baseGas: baseGas,
                gasPrice: gasPrice,
                gasToken: gasToken,
                refundReceiver: refundReceiver,
                signatures: signatures
            })
        );

        listIndex = transactionList.length - 1;
        // ---------

        emit SafeTransactionEnqueued(
            signerAddress,
            safeAddress,
            chainId,
            nonce,
            listIndex,
            safeTxHash
        );

        return listIndex;
    }

    /**
     * @notice Retrieves the list of enqueued Safe transactions data for a specific derived signer and other unique identifiers.
     * @dev Provides O(1) lookup time to get the array based on the mapping structure.
     * Requires the address derived from the *first* signature provided during enqueueing (using the internally calculated EIP-712 hash).
     * @param signerAddress The address derived from the first signature.
     * @param safeAddress The address of the Safe account.
     * @param chainId The chain ID of the transaction.
     * @param nonce The nonce of the transaction.
     * @return The array of stored SafeTransactionData structs. Returns an empty array if no transactions found for the key.
     */
    function retrieveTransaction(
        address signerAddress,
        address safeAddress,
        uint256 chainId,
        uint256 nonce
    ) public view returns (SafeTransactionData[] memory) {
        // O(1) read operation directly accessing the nested mapping, returning the array.
        return transactions[signerAddress][safeAddress][chainId][nonce];
    }

    // ================= Internal Helper Functions ==================

    /**
     * @dev Calculates the EIP-712 domain separator for a given Safe address and chain ID.
     * @param _safeAddress The address of the Safe contract (verifying contract).
     * @param _chainId The chain ID.
     * @return The EIP-712 domain separator.
     */
    function _calculateDomainSeparator(
        address _safeAddress,
        uint256 _chainId
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(DOMAIN_SEPARATOR_TYPEHASH, _chainId, _safeAddress)
            );
    }

    /**
     * @dev Calculates the final EIP-712 hash to be signed by owners, based on all transaction parameters.
     * @param _safeAddress The address of the Safe contract (verifying contract).
     * @param _chainId The chain ID for domain separator calculation.
     * @param to Destination address.
     * @param value Ether value.
     * @param data Data payload.
     * @param operation Operation type.
     * @param safeTxGas Gas limit for the transaction.
     * @param baseGas Base gas cost.
     * @param gasPrice Gas price.
     * @param gasToken Gas token address.
     * @param refundReceiver Refund receiver address.
     * @param _nonce Transaction nonce.
     * @return The final EIP-712 compliant hash to sign (abi.encodePacked(0x19, 0x01, domainSeparator, hash(SafeTx struct))).
     */
    function _calculateSafeTxHash(
        address _safeAddress,
        uint256 _chainId,
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address refundReceiver,
        uint256 _nonce
    ) internal pure returns (bytes32) {
        // Calculate the hash of the SafeTx struct data first
        bytes32 safeTxStructHash = keccak256(
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
                _nonce
            )
        );

        // Then calculate the domain separator
        bytes32 domainSeparator = _calculateDomainSeparator(
            _safeAddress,
            _chainId
        );

        // Finally, combine them into the hash to sign
        return
            keccak256(
                abi.encodePacked(
                    bytes1(0x19),
                    bytes1(0x01),
                    domainSeparator,
                    safeTxStructHash
                )
            );
    }
}
