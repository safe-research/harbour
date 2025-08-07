// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.29;

import {EncryptionKeyRegistered} from "./interfaces/Events.sol";

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
           in order to support asymmetric encryption schemes of the transaction data.
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
}
