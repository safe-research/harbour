// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.29;

import {
    NothingToEnqueue,
    SignerAlreadySignedTransaction
} from "./interfaces/Errors.sol";
import {
    EncryptionKeyRegistered,
    SafeTransactionRegistered,
    SafeTransactionSigned
} from "./interfaces/Events.sol";
import {ISafeSecretHarbour} from "./interfaces/Harbour.sol";
import {
    EncryptionKey,
    SafeTransactionRegistrationHandle
} from "./interfaces/Types.sol";
import {IERC165} from "./interfaces/ERC165.sol";
import {BlockNumbers} from "./libs/BlockNumbers.sol";
import {CoreLib} from "./libs/CoreLib.sol";
import {RegistrationKey} from "./libs/RegistrationKey.sol";

/**
 * @title Safe Secret Harbour
 * @notice Permissionless, append-only registry that lets **any EOA signer** publish encrypted Safe
 *         transactions ("SafeTx") and their signatures. Clients without an off-chain indexer can
 *         reconstruct the full multisig payload with only:
 *         1. the Safe address;
 *         2. the target `chainId`;
 *         3. the Safe `nonce`;
 *         4. the current Safe owners set; and
 *         5. a key to decrypt the transaction payload.
 *
 *         Each unique `safeTxHash` (ERC-712 digest of the SafeTx struct) may be registered more
 *         than once, to allow rotating the encryption.
 *
 *         Additionally, this contract contains a public encryption key registry, and functions as
 *         a trustless channel for signers to communicate public encryption keys amongst themselves
 *         in order to support asymmetric encryption schemes of the transaction data.
 */
contract SafeSecretHarbour is IERC165, ISafeSecretHarbour {
    using BlockNumbers for BlockNumbers.T;
    using BlockNumbers for BlockNumbers.Iterator;
    using RegistrationKey for RegistrationKey.T;

    // ------------------------------------------------------------------
    // Storage
    // ------------------------------------------------------------------

    /**
     * @dev Mapping of signers to their encryption keys.
     */
    mapping(address signer => EncryptionKey) private _encryptionKeys;

    /**
     * @dev Mapping of registration key to an array of block numbers where a Safe transaction was
     *      registered with the harbour.
     *
     *      Note that the same Safe transaction can be registered **multiple times** with harbour.
     *      This is important to allow appending additional encryption data (such as new wrapped
     *      encryption keys for signers that either rotated or registered their public encryption
     *      key after the initial transaction submission.
     */
    mapping(RegistrationKey.T => BlockNumbers.T) private _registrations;

    /**
     * @dev Mapping per signer from Safe transaction hashes to the block in which a signature was
     *      registered.
     */
    mapping(address signer => mapping(bytes32 safeTxHash => uint256 blockNumber))
        private _signatures;

    // ------------------------------------------------------------------
    // ERC-165 Implementation
    // ------------------------------------------------------------------

    /// @inheritdoc IERC165
    function supportsInterface(
        bytes4 interfaceId
    ) external pure returns (bool) {
        return
            interfaceId == type(IERC165).interfaceId ||
            interfaceId == type(ISafeSecretHarbour).interfaceId;
    }

    // ------------------------------------------------------------------
    // External & public write functions
    // ------------------------------------------------------------------

    /**
     * @notice Register a public encryption key for a signer.
     *
     * @param context   A 32-byte context specific to the public encryption key.
     * @param publicKey The public encryption key to be registered for the `msg.sender` signer.
     */
    function registerEncryptionKey(
        bytes32 context,
        bytes32 publicKey
    ) external {
        _encryptionKeys[msg.sender] = EncryptionKey(context, publicKey);
        emit EncryptionKeyRegistered(msg.sender, context, publicKey);
    }

    /**
     * @notice Register an encrypted Safe transaction and signature.
     *
     * @dev This function serves two purposes:
     *      1. To register Safe transaction encryption data
     *      2. To add signatures to a Safe transaction
     *
     * @param chainId          Chain id the transaction is meant for.
     * @param safe             Target Safe Smart-Account.
     * @param nonce            Safe nonce.
     * @param safeTxStructHash The ERC-712 struct hash of the Safe transaction data.
     * @param encryptionBlob   A blob containing encrypted transaction data. This can either be the
     *                         encrypted transaction itself, or additional encrypted keys to new
     *                         signer public keys. The exact format is not enforced and application
     *                         dependent. There are no guarantees that the blob actually matches the
     *                         provided `safeTxStructHash`. The reference implementation uses JWE to
     *                         encrypt the RLP-encoded Safe transaction with key wrapping for the
     *                         recipients' X25519 public keys. _Optional_: can be omitted to
     *                         register a signature without any new encrypted transaction data.
     * @param signature        A 65-byte ECDSA signature. _Optional_: can be omitted to register
     *                         new encrypted transaction data without a signature.
     *
     * @return uid             The unique signer-specific identifer of the transaction registration.
     *                         Zero if `encryptionBlob` is empty.
     *
     * @custom:events Emits {SafeTransactionSigned} and {SafeTransactionRegistered}.
     */
    function enqueueTransaction(
        uint256 chainId,
        address safe,
        uint256 nonce,
        bytes32 safeTxStructHash,
        bytes calldata signature,
        bytes calldata encryptionBlob
    ) external returns (bytes32 uid) {
        require(
            signature.length | encryptionBlob.length != 0,
            NothingToEnqueue()
        );

        bytes32 safeTxHash = CoreLib.computePartialSafeTxHash(
            chainId,
            safe,
            safeTxStructHash
        );

        if (signature.length != 0) {
            _registerSignature(safeTxHash, signature);
        }

        if (encryptionBlob.length != 0) {
            uid = _registerTransaction(
                chainId,
                safe,
                nonce,
                msg.sender,
                safeTxHash,
                encryptionBlob
            );
        }
    }

    // ------------------------------------------------------------------
    // External & public read functions
    // ------------------------------------------------------------------

    /**
     * @notice Retrieves encryption public keys for the specified signers.
     *
     * @param signers     The list of signers to fetch encryption keys for.
     *
     * @return publicKeys The encryption public keys for each of the signers, or `0` if none was
     *                    registered. The keys are in the same order as the signers array (i.e. for
     *                    all `i`, the key for `signer[i]` is `publicKey[i]`).
     */
    function retrieveEncryptionPublicKeys(
        address[] calldata signers
    ) external view returns (bytes32[] memory publicKeys) {
        publicKeys = new bytes32[](signers.length);
        for (uint256 i = 0; i < signers.length; i++) {
            publicKeys[i] = _encryptionKeys[signers[i]].publicKey;
        }
    }

    /**
     * @notice Retrieves the encryption keys for a signer.
     *
     * @param signer         The signer to fetch encryption keys for.
     *
     * @return encryptionKey The registered encryption key.
     */
    function retrieveEncryptionKey(
        address signer
    ) external view returns (EncryptionKey memory encryptionKey) {
        encryptionKey = _encryptionKeys[signer];
    }

    /**
     * @notice Paginated getter for Safe transaction registrations.
     *
     * @dev Note that this function does not return the full registered transaction directly, but
     *      a unique identifier and block number that can be used to query an log with the full
     *      transaction details.
     *
     * @param chainId     Target chain id.
     * @param safe        Safe Smart-Account.
     * @param nonce       Safe nonce.
     * @param notary      Address that registered ecrypted transaction data.
     * @param start       Zero-based start index of the slice.
     * @param count       Maximum number of entries to return.
     *
     * @return page       Array slice `[start … start+count)` (may be shorter).
     * @return totalCount Total number of registrations for the `(chainId, safe, nonce, signer)`
     *                    tuple.
     */
    function retrieveRegistrations(
        uint256 chainId,
        address safe,
        uint256 nonce,
        address notary,
        uint256 start,
        uint256 count
    )
        external
        view
        returns (
            SafeTransactionRegistrationHandle[] memory page,
            uint256 totalCount
        )
    {
        RegistrationKey.T registration = RegistrationKey.get(
            chainId,
            safe,
            nonce,
            notary
        );
        BlockNumbers.Iterator memory it = _registrations[registration].iter();

        totalCount = it.count();
        it.skip(start);
        it.take(count);

        page = new SafeTransactionRegistrationHandle[](it.count());
        unchecked {
            for (uint256 i = 0; it.next(); i++) {
                SafeTransactionRegistrationHandle memory item = page[i];
                item.blockNumber = it.value();
                item.uid = registration.uniqueIdentifier(start + i);
            }
        }
    }

    /**
     * @notice Convenience getter returning the **number** of registrations stored for a specific
     *         `(chainId, safe, nonce, notary)` tuple.
     *
     * @param chainId Target chain id.
     * @param safe    Safe Smart-Account.
     * @param nonce   Safe nonce.
     * @param notary  Notary address.
     *
     * @return count  Number of registrations.
     */
    function retrieveRegistrationCount(
        uint256 chainId,
        address safe,
        uint256 nonce,
        address notary
    ) external view returns (uint256 count) {
        RegistrationKey.T registration = RegistrationKey.get(
            chainId,
            safe,
            nonce,
            notary
        );
        count = _registrations[registration].len();
    }

    /**
     * @notice Retrieve Safe transaction signatures for the specified signers.
     *
     * @dev Note that this function does not return the signature directly, the block number that
     *      can be used to query an log with the signature bytes.
     *
     * @param signers    The signer addresses.
     * @param safeTxHash ERC-712 digest of the transaction
     *
     * @return blockNumbers The block numbers containing the Safe transaction signature events for
     *                      the specified signers and Safe transaction hash.
     */
    function retrieveSignatures(
        address[] calldata signers,
        bytes32 safeTxHash
    ) external view returns (uint256[] memory blockNumbers) {
        blockNumbers = new uint256[](signers.length);
        unchecked {
            for (uint256 i = 0; i < signers.length; i++) {
                blockNumbers[i] = _signatures[signers[i]][safeTxHash];
            }
        }
    }

    // ------------------------------------------------------------------
    // Internal functions
    // ------------------------------------------------------------------

    /**
     * @dev Internal function to register a Safe transaction.
     *
     * @param chainId        Chain id the transaction is meant for.
     * @param safe           Safe Smart-Account.
     * @param nonce          Safe nonce.
     * @param notary         The account that submitted the encrypted transaction data blob for
     *                       registration.
     * @param safeTxHash     ERC-712 digest of the transaction.
     * @param encryptionBlob The Safe transaction encryption blob.
     *
     * @return uid       The unique signer-specific identifer of the registration.
     */
    function _registerTransaction(
        uint256 chainId,
        address safe,
        uint256 nonce,
        address notary,
        bytes32 safeTxHash,
        bytes calldata encryptionBlob
    ) internal returns (bytes32 uid) {
        RegistrationKey.T registration = RegistrationKey.get(
            chainId,
            safe,
            nonce,
            notary
        );
        uint256 index = _registrations[registration].append(block.number);

        uid = registration.uniqueIdentifier(index);
        emit SafeTransactionRegistered(uid, safeTxHash, encryptionBlob);
    }

    /**
     * @dev Internal function to register a Safe transaction signature after validation.
     *
     * @param safeTxHash ERC-712 digest of the transaction.
     * @param signature  The ECDSA signature bytes.
     */
    function _registerSignature(
        bytes32 safeTxHash,
        bytes calldata signature
    ) internal {
        (address signer, , ) = CoreLib.recoverSigner(safeTxHash, signature);
        require(
            _signatures[signer][safeTxHash] == 0,
            SignerAlreadySignedTransaction(signer, safeTxHash)
        );

        _signatures[signer][safeTxHash] = block.number;
        emit SafeTransactionSigned(signer, safeTxHash, signature);
    }
}
