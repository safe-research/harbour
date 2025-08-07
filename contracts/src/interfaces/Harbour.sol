// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.29;

import {SafeTransactionRegistrationHandle} from "./Types.sol";

/// @title Safe Secret Harbour Interface
interface ISafeSecretHarbour {
    function registerEncryptionKey(bytes32 encryptionKey) external;

    function registerTransaction(
        uint256 chainId,
        address safe,
        uint256 nonce,
        bytes32 safeTxStructHash,
        bytes calldata signature,
        bytes calldata encryptedSafeTx
    ) external returns (bytes32 uid);

    function retrieveEncryptionKeys(
        address[] calldata signers
    ) external view returns (bytes32[] memory encryptionKeys);

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
        );
}
