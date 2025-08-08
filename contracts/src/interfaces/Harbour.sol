// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.29;

import {EncryptionKey, SafeTransactionRegistrationHandle} from "./Types.sol";

/// @title Safe Secret Harbour Interface
interface ISafeSecretHarbour {
    function registerEncryptionKey(bytes32 context, bytes32 publicKey) external;

    function registerTransaction(
        uint256 chainId,
        address safe,
        uint256 nonce,
        bytes32 safeTxStructHash,
        bytes calldata signature,
        bytes calldata encryptionBlob
    ) external returns (bytes32 uid);

    function retrieveEncryptionPublicKeys(
        address[] calldata signers
    ) external view returns (bytes32[] memory publicKeys);

    function retrieveEncryptionKey(
        address signers
    ) external view returns (EncryptionKey memory encryptionKey);

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
        );

    function retrieveSignatures(
        address[] calldata signers,
        bytes32 safeTxHash
    ) external view returns (uint256[] memory blockNumbers);
}
