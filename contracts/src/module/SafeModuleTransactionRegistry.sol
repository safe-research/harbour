// SPDX-License-Identifier: GNU GPLv3
pragma solidity ^0.8.21;

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
    struct SafeModuleTransactionSignature {
        uint8 v;
        bytes32 r;
        bytes32 s;
        bytes dynamicPart;
    }

    struct SafeModuleTransactionWithSignatures {
        SafeModuleTransaction transaction;
        SafeModuleTransactionSignature[] signatures;
    }

    struct SafeModuleTransaction {
        address to;
        uint256 value;
        bytes data;
        uint8 operation;
        uint256 nonce;
    }

    uint8 public constant SIGNATURE_LENGTH_BYTES = 65;
    string public constant NAME = "SafeModuleTransactionRegistry";
    string public constant VERSION = "1";

    bytes32 public immutable MODULE_TX_TYPEHASH =
        keccak256(
            "SafeModuleTransactionRegistry(address to,uint256 value,bytes data,uint8 operation,uint256 nonce)"
        );

    mapping(address safe => uint256 nonce) public moduleTxNonces;
    mapping(address safe => mapping(uint256 nonce => SafeModuleTransactionWithSignatures[]))
        public transactions;

    event TransactionRegistered(
        address indexed msgSender,
        address indexed safe,
        uint256 indexed nonce,
        uint256 index
    );
    event SignatureAdded(
        address indexed msgSender,
        address indexed safe,
        uint256 indexed nonce,
        uint256 index
    );
    event TransactionExecuted(
        address indexed safe,
        uint256 indexed nonce,
        uint256 index
    );

    error NonceTooLow(uint256 currentNonce, uint256 providedNonce);
    error InvalidTransactionIndex(
        address safe,
        uint256 nonce,
        uint256 index,
        uint256 maxIndex
    );
    error TransactionNotFound(address safe, uint256 nonce, uint256 index);
    error ModuleTransactionFailed(address safe, uint256 nonce, uint256 index);
    error InvalidNonce(address safe, uint256 expected, uint256 given);
    error InvalidMsgSender(address safe, address msgSender);
    error EmptySignatures();

    /**
     * @notice Registers a new transaction to be executed later
     * @param safe The Safe wallet address
     * @param safeModuleTransaction The transaction details with signatures
     * @return index The index of the registered transaction
     */
    function registerSafeModuleTransaction(
        Safe safe,
        SafeModuleTransactionWithSignatures calldata safeModuleTransaction
    ) external returns (uint256 index) {
        if (safeModuleTransaction.signatures.length < 1) {
            revert EmptySignatures();
        }

        bytes32 hash = hashMessage(safeModuleTransaction.transaction);

        bytes32 moduleTxHash = keccak256(
            abi.encodePacked("\x19\x01", getDomainSeparator(), hash)
        );

        bytes memory signatures = encodeSignatures(
            safeModuleTransaction.signatures
        );

        // This is required to prevent malicious actor from proposing spam transactions and blocking the queue
        safe.checkNSignatures(
            moduleTxHash,
            abi.encodePacked(hash),
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
            storage _safeModuleTransaction = transactions[address(safe)][
                safeModuleTransaction.transaction.nonce
            ];

        // Push the new transaction to the array
        _safeModuleTransaction.push(safeModuleTransaction);

        emit TransactionRegistered(
            msg.sender,
            address(safe),
            safeModuleTransaction.transaction.nonce,
            index
        );
        return index;
    }

    /**
     * @notice Registers a new signature for a Safe module transaction
     * @param safe The Safe wallet address
     * @param nonce The transaction nonce
     * @param index The transaction index for the given nonce
     * @param safeModuleTransactionSignature The signature to add
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
     * @notice Gets a module transaction by safe address, nonce and index
     * @param safe The Safe wallet address
     * @param nonce The transaction nonce
     * @param index The transaction index for the given nonce
     * @return The transaction details
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
     * @notice Executes a transaction from the registry
     * @param safe The Safe wallet address
     * @param index The transaction index for the current nonce
     */
    function execTransactionFromModule(
        Safe safe,
        uint256 nonce,
        uint256 index
    ) external {
        uint256 _nonce = moduleTxNonces[address(safe)];

        moduleTxNonces[address(safe)] = nonce + 1;

        if (_nonce != nonce) {
            revert InvalidNonce(address(safe), _nonce, nonce);
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

        bytes32 hash = hashMessage(safeModuleTransaction);

        bytes32 moduleTxHash = keccak256(
            abi.encodePacked("\x19\x01", getDomainSeparator(), hash)
        );

        bytes memory signaturesBytes = encodeSignatures(
            safeModuleTransactionWithSignatures.signatures
        );

        // Verify signatures through the Safe contract before executing the tx.
        // This is required to verify if provided signatures are still valid.
        safe.checkSignatures(
            moduleTxHash,
            abi.encodePacked(hash),
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
        // Pre-calculate total static signature length
        uint256 staticLength = signatures.length * SIGNATURE_LENGTH_BYTES;

        // Create memory for signature bytes
        bytes memory signatureBytes = new bytes(0);
        bytes memory dynamicBytes = new bytes(0);

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
                    staticLength + dynamicBytes.length
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
     * @notice Gets the EIP-712 domain separator
     * @return The domain separator hash
     */
    function getDomainSeparator() private view returns (bytes32) {
        return
            keccak256(
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
