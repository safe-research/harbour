// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.29;

import {InvalidECDSASignatureLength} from "./interfaces/Errors.sol";
import {
    EncryptionKeyRegistered,
    SafeTransactionRegistered
} from "./interfaces/Events.sol";
import {SafeTransactionRegistrationHandle} from "./interfaces/Types.sol";
import {CoreLib} from "./libs/CoreLib.sol";

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
 *         Each unique `safeTxHash` (EIP-712 digest of the SafeTx struct) may be registered more
 *         than once, to allow rotating the encryption.
 *
 *         Additionally, this contract contains a public encryption key registry, and functions as
 *         a trustless channel for signers to communicate public encryption keys amongst themselves
 *         in order to support asymmetric encryption schemes of the transaction data.
 */
contract SafeSecretHarbour {
    // ------------------------------------------------------------------
    // Storage
    // ------------------------------------------------------------------

    /**
     * Mapping of signers to a public encryption key.
     * @dev This contract does not enforce any key format, but uses Curve25519 public encryption
     *      keys in the reference client implementation. The only restriction is that the key must
     *      fit in 32 bytes.
     */
    mapping(address signer => bytes32 publicKey) private _encryptionKeys;

    /**
     * Mapping of `(chainId, safe, nonce, signer)` to an array of block indices where a Safe
     * transaction was registered with the harbour.
     * @dev Note that the same Safe transaction can be registered **multiple times** with harbour.
     *      This is important to allow re-submitting the same transaction encrypted for a different
     *      set of keys (in the case a signer registered or rotated an encryption key after the
     *      transaction was initially registered).
     */
    mapping(uint256 chainId => mapping(address safe => mapping(uint256 nonce => mapping(address signer => uint256[]))))
        private _registrations;

    // ------------------------------------------------------------------
    // External & public write functions
    // ------------------------------------------------------------------

    /**
     * @notice Register a public encryption key for a signer.
     *
     * @param encryptionKey The public encryption key to be registered for the
     *                      `msg.sender` signer.
     */
    function registerEncryptionKey(bytes32 encryptionKey) external {
        _encryptionKeys[msg.sender] = encryptionKey;
        emit EncryptionKeyRegistered(msg.sender, encryptionKey);
    }

    /**
     * @notice Publish an encrypted Safe transaction.
     *
     * @dev If the Safe transaction has already been registered, it will be registered again. This
     *      allows a signer to re-broadcast the same Safe transaction with new cyphertext, in case
     *      a new signer encryption key was added or a signer encryption key was rotated.
     *
     * @param chainId          Chain id the transaction is meant for.
     * @param safe             Target Safe Smart-Account.
     * @param nonce            Safe nonce.
     * @param safeTxStructHash The EIP-712 struct hash of the Safe transaction data.
     * @param signature        **Single** 65-byte ECDSA signature.
     * @param encryptedSafeTx  The encrypted Safe transaction. This contract does not enforce any
     *                         restrictions on the encryption scheme (in fact, this can technically
     *                         be the Safe transaction in plain text!), but uses JWE with algorithm
     *                         `ECDH-ES+XC20PKW`. There are no guarantees that the encrypted Safe
     *                         transaction data actually matches the provided `safeTxStructHash`.
     *
     * @return uid             The unique signer-specific identifer of the registration.
     *
     * @custom:events Emits {SafeTransactionRegistered}.
     */
    function registerTransaction(
        uint256 chainId,
        address safe,
        uint256 nonce,
        bytes32 safeTxStructHash,
        bytes calldata signature,
        bytes calldata encryptedSafeTx
    ) external returns (bytes32 uid) {
        require(signature.length == 65, InvalidECDSASignatureLength());

        bytes32 safeTxHash = CoreLib.computePartialSafeTxHash(
            chainId,
            safe,
            safeTxStructHash
        );
        (address signer, , ) = CoreLib.recoverSigner(safeTxHash, signature);

        uid = _registerTransaction(
            safeTxHash,
            chainId,
            safe,
            nonce,
            signer,
            signature,
            encryptedSafeTx
        );
    }

    // ------------------------------------------------------------------
    // External & public read functions
    // ------------------------------------------------------------------

    /**
     * @notice Retrieves encryption keys for the specified signers.
     *
     * @param signers         The list of signers to fetch encryption keys for.
     *
     * @return encryptionKeys The encryption keys for each of the signers, or `0` if none was
     *                        registered. The encryption keys are in the same order as the signers
     *                        array (i.e. for all `i`, the encryption key for `signer[i]` is
     *                        `encryptionKeys[i]`).
     */
    function retrieveEncryptionKeys(
        address[] calldata signers
    ) external view returns (bytes32[] memory encryptionKeys) {
        encryptionKeys = new bytes32[](signers.length);
        for (uint256 i = 0; i < signers.length; i++) {
            encryptionKeys[i] = _encryptionKeys[signers[i]];
        }
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
     * @param signer      Address that created the signatures.
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
        address signer,
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
        uint256[] storage blocks = _registrations[chainId][safe][nonce][signer];

        totalCount = blocks.length;
        if (start >= totalCount) {
            return (page, totalCount);
        }

        uint256 end = start + count;
        if (end > totalCount) {
            end = totalCount;
        }
        uint256 len = end - start;

        page = new SafeTransactionRegistrationHandle[](len);
        for (uint256 i; i < len; i++) {
            uint256 blockIndex = blocks[start + i];
            bytes32 uid = _registrationUid(blocks, start + i);
            page[i] = SafeTransactionRegistrationHandle({
                blockIndex: blockIndex,
                uid: uid
            });
        }
    }

    /**
     * @notice Convenience getter returning the **number** of registrations stored for a specific
     *         `(chainId, safe, nonce, signer)` tuple.
     *
     * @param chainId Target chain id.
     * @param safe    Safe Smart-Account.
     * @param nonce   Safe nonce.
     * @param signer  Signer address.
     *
     * @return count  Number of registrations.
     */
    function retrieveRegistrationCount(
        uint256 chainId,
        address safe,
        uint256 nonce,
        address signer
    ) external view returns (uint256 count) {
        count = _registrations[chainId][safe][nonce][signer].length;
    }

    // ------------------------------------------------------------------
    // Internal functions
    // ------------------------------------------------------------------

    /**
     * @dev Internal function to register a Safe transaction and signature after validation.
     *
     * @param safeTxHash EIP-712 digest of the transaction.
     * @param chainId    Chain id the transaction is meant for.
     * @param safe       Target Safe Smart-Account.
     * @param nonce      Safe nonce.
     * @param signer     Address that created the signatures.
     * @param signature  The ECDSA signature bytes.
     * @param signer     Address that created the signatures.
     *
     * @return uid       The unique signer-specific identifer of the registration.
     */
    function _registerTransaction(
        bytes32 safeTxHash,
        uint256 chainId,
        address safe,
        uint256 nonce,
        address signer,
        bytes calldata signature,
        bytes calldata encryptedSafeTx
    ) internal returns (bytes32 uid) {
        uint256[] storage blocks = _registrations[chainId][safe][nonce][signer];
        uint256 index = blocks.length;
        blocks.push(block.number);

        uid = _registrationUid(blocks, index);
        emit SafeTransactionRegistered(
            uid,
            safeTxHash,
            signature,
            encryptedSafeTx
        );
    }

    /**
     * @dev Internal function to compute an opaque UID for a Safe transaction registration.
     *
     * @param blocks `(chainId, safe, nonce, signer)` specific list of block indices of Safe
     *               transaction registrations.
     * @param index  The index of the registration in `blocks`.
     *
     * @return uid   A unique identifier for the registration.
     */
    function _registrationUid(
        uint256[] storage blocks,
        uint256 index
    ) internal pure returns (bytes32 uid) {
        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            mstore(0, index)
            mstore(32, blocks.slot)
            uid := keccak256(0, 64)
        }
    }
}
