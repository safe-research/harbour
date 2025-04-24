// SPDX-License-Identifier: GNU GPLv3
pragma solidity ^0.8.29;

import {Safe} from "@safe-global/safe-contracts/contracts/Safe.sol";
import {Enum} from "@safe-global/safe-contracts/contracts/common/Enum.sol";

/**
 * @title SafeModuleTransactionRegistry
 * @notice A module for Safe wallets to queue and execute transactions with EIP-712 signatures
 * @dev Signatures must be sorted by signer address. If signatures are not properly sorted,
 *      the transaction will need to be queued again with correct order.
 *      TODO: Allow adding signatures in any order.
 *      TODO: (Optional) Allow bumping nonce to invalidate existing queued transactions.
 *      TODO: (Optional) Consider using compression
 *      TODO: (Optional) Consider allowing non-sequential nonces along with sequential nonces (like ERC-4337).
 *      TODO: (Optional) Advanced features: Transaction deadline
 */
contract SafeModuleTransactionRegistry {
    /// @notice Represents an ECDSA signature for a Safe module transaction.
    /// @dev Contains the v, r, s values and optional dynamic data for contract signatures.
    /// @param v Recovery byte of the signature.
    /// @param r First 32 bytes of the signature.
    /// @param s Second 32 bytes of the signature.
    /// @param dynamicPart Optional dynamic data appended for contract signatures.
    struct SafeModuleTransactionSignature {
        uint8 v;
        bytes32 r;
        bytes32 s;
        bytes dynamicPart;
    }

    /// @notice Bundles a Safe module transaction with its associated signatures.
    /// @param transaction The SafeModuleTransaction details.
    /// @param signatures The list of signatures for the transaction.
    struct SafeModuleTransactionWithSignatures {
        SafeModuleTransaction transaction;
        SafeModuleTransactionSignature[] signatures;
    }

    /// @notice Defines a transaction to be executed via the Safe module.
    /// @dev Contains the destination address, value in Wei, calldata, operation type, and nonce.
    /// @param to Recipient address of the transaction.
    /// @param value Ether value to send in Wei.
    /// @param data Calldata of the transaction.
    /// @param operation Operation type (0 = call, 1 = delegatecall).
    /// @param nonce Nonce for ordering module transactions.
    struct SafeModuleTransaction {
        address to;
        uint256 value;
        bytes data;
        uint8 operation;
        uint256 nonce;
    }

    /// @notice Fixed length in bytes for an individual signature (r + s + v components).
    uint8 public constant SIGNATURE_LENGTH_BYTES = 65;

    /// @notice EIP-712 domain name for this module.
    string public constant NAME = "SafeModuleTransactionRegistry";

    /// @notice EIP-712 domain version for this module.
    string public constant VERSION = "1";

    /// @notice Type hash of SafeModuleTransaction for EIP-712 encoding.
    bytes32 public immutable MODULE_TX_TYPEHASH =
        keccak256(
            "SafeModuleTransactionRegistry(address to,uint256 value,bytes data,uint8 operation,uint256 nonce)"
        );

    /// @notice EIP-712 domain separator for this module.
    bytes32 private immutable DOMAIN_SEPARATOR;

    /// @notice Tracks the current execution nonce for each Safe.
    /// @dev Increments after each successful execution of a queued transaction.
    mapping(address safe => uint256 nonce) public moduleTxNonces;

    /// @notice Queued module transactions per Safe and nonce.
    /// @dev Allows multiple pending transactions under the same nonce.
    mapping(address safe => mapping(uint256 nonce => SafeModuleTransactionWithSignatures[]))
        public transactions;

    /// @notice Emitted when a transaction is registered for execution.
    /// @param msgSender The address that registered the transaction.
    /// @param safe The Safe wallet address.
    /// @param nonce The transaction nonce.
    /// @param index Index of the transaction under the specified nonce.
    event TransactionRegistered(
        address indexed msgSender,
        address indexed safe,
        uint256 indexed nonce,
        uint256 index
    );

    /// @notice Emitted when an additional signature is added to a queued transaction.
    /// @param msgSender The address that added the signature.
    /// @param safe The Safe wallet address.
    /// @param nonce The transaction nonce.
    /// @param index Index of the transaction under the specified nonce.
    event SignatureAdded(
        address indexed msgSender,
        address indexed safe,
        uint256 indexed nonce,
        uint256 index
    );

    /// @notice Emitted when a queued transaction is successfully executed via the module.
    /// @param safe The Safe wallet address.
    /// @param nonce The transaction nonce.
    /// @param index Index of the transaction under the specified nonce.
    event TransactionExecuted(
        address indexed safe,
        uint256 indexed nonce,
        uint256 index
    );

    /// @notice Reverts when the provided nonce is lower than the current nonce.
    /// @param currentNonce The current execution nonce.
    /// @param providedNonce The provided nonce.
    error NonceTooLow(uint256 currentNonce, uint256 providedNonce);

    /// @notice Reverts when using an invalid transaction index for a Safe and nonce.
    /// @param safe The Safe wallet address.
    /// @param nonce The transaction nonce.
    /// @param index The provided index.
    /// @param maxIndex Maximum valid index (exclusive upper bound).
    error InvalidTransactionIndex(
        address safe,
        uint256 nonce,
        uint256 index,
        uint256 maxIndex
    );

    /// @notice Reverts when the specified transaction is not found.
    /// @param safe The Safe wallet address.
    /// @param nonce The transaction nonce.
    /// @param index The transaction index.
    error TransactionNotFound(address safe, uint256 nonce, uint256 index);

    /// @notice Reverts when a module transaction execution fails.
    /// @param safe The Safe wallet address.
    /// @param nonce The transaction nonce.
    /// @param index The transaction index.
    error ModuleTransactionFailed(address safe, uint256 nonce, uint256 index);

    /// @notice Reverts when an invalid nonce is used for execution.
    /// @param safe The Safe wallet address.
    /// @param expected The expected current nonce.
    /// @param given The provided nonce.
    error InvalidNonce(address safe, uint256 expected, uint256 given);

    /// @notice Reverts when attempting to register or execute a transaction with no signatures.
    error EmptySignatures();

    /// @notice Initializes the EIP-712 domain separator.
    constructor() {
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
                ),
                keccak256(bytes(NAME)),
                keccak256(bytes(VERSION)),
                block.chainid,
                address(this)
            )
        );
    }

    /**
     * @notice Registers a new transaction to be executed later.
     * @param safe The Safe wallet address.
     * @param safeModuleTransaction The transaction details with signatures.
     * @return index The index of the registered transaction.
     * @dev Prevents malicious actors from spamming transactions by verifying required signatures via the Safe contract.
     * @dev The `signatures` array within `safeModuleTransaction` MUST be sorted by signer address (case-insensitive).
     */
    function registerSafeModuleTransaction(
        Safe safe,
        SafeModuleTransactionWithSignatures calldata safeModuleTransaction
    ) external returns (uint256 index) {
        if (safeModuleTransaction.signatures.length < 1) {
            revert EmptySignatures();
        }

        (
            bytes32 structHash,
            bytes32 moduleTxHash,
            bytes memory signatures
        ) = _packModuleTx(
                safeModuleTransaction.transaction,
                safeModuleTransaction.signatures
            );

        // This is required to prevent malicious actor from proposing spam transactions and blocking the queue
        safe.checkNSignatures(
            moduleTxHash,
            abi.encodePacked(structHash),
            signatures,
            safeModuleTransaction.signatures.length
        );

        uint256 currentNonce = moduleTxNonces[address(safe)];
        if (currentNonce > safeModuleTransaction.transaction.nonce) {
            revert NonceTooLow(
                currentNonce,
                safeModuleTransaction.transaction.nonce
            );
        }

        index = transactions[address(safe)][
            safeModuleTransaction.transaction.nonce
        ].length;

        SafeModuleTransactionWithSignatures[]
            storage queuedTransactionsForNonce = transactions[address(safe)][
                safeModuleTransaction.transaction.nonce
            ];

        // Push the new transaction to the array
        queuedTransactionsForNonce.push(safeModuleTransaction);

        emit TransactionRegistered(
            msg.sender,
            address(safe),
            safeModuleTransaction.transaction.nonce,
            index
        );
        return index;
    }

    /**
     * @notice Registers a new signature for a Safe module transaction.
     * @param safe The Safe wallet address.
     * @param nonce The transaction nonce.
     * @param index The transaction index for the given nonce.
     * @param safeModuleTransactionSignature The signature to add.
     * @dev Signatures can be added incrementally to an existing queued transaction.
     * @custom:warning This function allows anyone to add signature data. It does not validate the signature itself.
     *          Validity is checked collectively only during `execTransactionFromModule`.
     */
    function registerSafeModuleTransactionSignature(
        Safe safe,
        uint256 nonce,
        uint256 index,
        SafeModuleTransactionSignature calldata safeModuleTransactionSignature
    ) external {
        uint256 txCount = transactions[address(safe)][nonce].length;
        if (index >= txCount) {
            revert InvalidTransactionIndex(
                address(safe),
                nonce,
                index,
                txCount
            );
        }

        SafeModuleTransactionWithSignatures
            storage safeModuleTransaction = transactions[address(safe)][nonce][
                index
            ];

        safeModuleTransaction.signatures.push(safeModuleTransactionSignature);

        emit SignatureAdded(msg.sender, address(safe), nonce, index);
    }

    /**
     * @notice Retrieves a queued module transaction along with its signatures.
     * @param safe The Safe wallet address.
     * @param nonce The transaction nonce.
     * @param index The transaction index for the given nonce.
     * @return SafeModuleTransactionWithSignatures The transaction with its signatures.
     * @dev Reverts if the index is out of bounds.
     */
    function getModuleTransaction(
        address safe,
        uint256 nonce,
        uint256 index
    ) public view returns (SafeModuleTransactionWithSignatures memory) {
        if (index >= transactions[safe][nonce].length) {
            revert TransactionNotFound(safe, nonce, index);
        }
        return transactions[safe][nonce][index];
    }

    /**
     * @notice Executes a queued transaction from the registry.
     * @param safe The Safe wallet address.
     * @param nonce The transaction nonce being executed.
     * @param index The transaction index for the given nonce.
     * @dev Increments the Safe's moduleTxNonces, verifies signatures, and then executes the transaction via the Safe contract.
     * @dev Assumes the signatures within the queued transaction were originally provided sorted by signer address.
     */
    function execTransactionFromModule(
        Safe safe,
        uint256 nonce,
        uint256 index
    ) external {
        uint256 _nonce = moduleTxNonces[address(safe)];
        if (_nonce != nonce) {
            revert InvalidNonce(address(safe), _nonce, nonce);
        }
        unchecked {
            moduleTxNonces[address(safe)] = nonce + 1;
        }

        if (index >= transactions[address(safe)][nonce].length) {
            revert TransactionNotFound(address(safe), nonce, index);
        }

        SafeModuleTransactionWithSignatures
            memory safeModuleTransactionWithSignatures = transactions[
                address(safe)
            ][nonce][index];

        SafeModuleTransaction
            memory safeModuleTransaction = SafeModuleTransaction(
                safeModuleTransactionWithSignatures.transaction.to,
                safeModuleTransactionWithSignatures.transaction.value,
                safeModuleTransactionWithSignatures.transaction.data,
                safeModuleTransactionWithSignatures.transaction.operation,
                nonce
            );

        (
            bytes32 structHash,
            bytes32 moduleTxHash,
            bytes memory signaturesBytes
        ) = _packModuleTx(
                safeModuleTransaction,
                safeModuleTransactionWithSignatures.signatures
            );

        // Verify signatures through the Safe contract before executing the tx.
        // This is required to verify if provided signatures are still valid.
        safe.checkSignatures(
            moduleTxHash,
            abi.encodePacked(structHash),
            signaturesBytes
        );

        // Execute the transaction
        bool success = safe.execTransactionFromModule(
            safeModuleTransaction.to,
            safeModuleTransaction.value,
            safeModuleTransaction.data,
            Enum.Operation(safeModuleTransaction.operation)
        );

        if (!success) {
            revert ModuleTransactionFailed(address(safe), nonce, index);
        }

        emit TransactionExecuted(address(safe), nonce, index);
    }

    /**
     * @notice Encodes signatures into bytes according to Safe contract format
     * @dev Signatures must be sorted by signer address, case-insensitive
     * @param signatures - array of signatures
     * @return Encoded signatures in bytes
     */
    function encodeSignatures(
        SafeModuleTransactionSignature[] memory signatures
    ) internal pure returns (bytes memory) {
        // Initialize empty byte arrays for static and dynamic signature parts
        bytes memory signatureBytes;
        bytes memory dynamicBytes;

        for (uint256 i = 0; i < signatures.length; i++) {
            if (signatures[i].dynamicPart.length > 0) {
                /* 
                A contract signature has a static part of 65 bytes and the dynamic part that needs to be appended at the
                end of signature bytes.
                The signature format is
                Signature type == 0
                Constant part: 65 bytes
                {32-bytes signature verifier}{32-bytes dynamic data position}{1-byte signature type}
                Dynamic part (solidity bytes): 32 bytes + signature data length
                {32-bytes signature length}{bytes signature data}
                */
                bytes32 dynamicPartPosition = bytes32(
                    signatureBytes.length + dynamicBytes.length
                );

                bytes32 dynamicPartLength = bytes32(
                    signatures[i].dynamicPart.length
                );

                bytes memory staticSignature = abi.encodePacked(
                    signatures[i].r,
                    dynamicPartPosition,
                    signatures[i].v
                );

                bytes memory dynamicPartWithLength = abi.encodePacked(
                    dynamicPartLength,
                    signatures[i].dynamicPart
                );

                signatureBytes = abi.encodePacked(
                    signatureBytes,
                    staticSignature
                );

                dynamicBytes = abi.encodePacked(
                    dynamicBytes,
                    dynamicPartWithLength
                );
            } else {
                signatureBytes = abi.encodePacked(
                    signatureBytes,
                    signatures[i].r,
                    signatures[i].s,
                    signatures[i].v
                );
            }
        }

        return abi.encodePacked(signatureBytes, dynamicBytes);
    }

    /**
     * @dev Prepares the struct hash, domain hash, and encodes signatures for EIP-712.
     */
    function _packModuleTx(
        SafeModuleTransaction memory tx_,
        SafeModuleTransactionSignature[] memory sigs
    )
        internal
        view
        returns (
            bytes32 structHash,
            bytes32 moduleTxHash,
            bytes memory signaturesBytes
        )
    {
        structHash = hashMessage(tx_);
        moduleTxHash = keccak256(
            abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR, structHash)
        );
        signaturesBytes = encodeSignatures(sigs);
    }

    /**
     * @notice Gets the EIP-712 domain separator
     * @return The domain separator hash
     */
    function getDomainSeparator() private view returns (bytes32) {
        return DOMAIN_SEPARATOR;
    }

    /**
     * @notice Computes the EIP-712 hash of the transaction data
     * @param message The transaction data without signatures
     * @return The message hash
     */
    function hashMessage(
        SafeModuleTransaction memory message
    ) private view returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    MODULE_TX_TYPEHASH,
                    message.to,
                    message.value,
                    keccak256(message.data), // bytes should be hashed
                    message.operation,
                    message.nonce
                )
            );
    }
}
