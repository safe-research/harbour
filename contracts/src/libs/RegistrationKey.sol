// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.29;

/**
 * @title Safe Secret Harbour Registration Key
 * @dev This registration key is used internally as a mapping key to transaction registration block
 *      numbers. It allows enumeration of block numbers where Safe transactions for a given chain,
 *      Safe, and nonce were registered by a notary.
 */
library RegistrationKey {
    type T is bytes32;

    /**
     * @notice Compute the registration key for a given `(chainId, safe, nonce, signer)` tuple.
     */
    function get(
        uint256 chainId,
        address safe,
        uint256 nonce,
        address notary
    ) internal pure returns (T key) {
        // uid = keccak256(chainId, safe, nonce, notary)
        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            let ptr := mload(0x40)
            mstore(ptr, chainId)
            mstore(add(ptr, 32), safe)
            mstore(add(ptr, 64), nonce)
            mstore(add(ptr, 96), notary)
            key := keccak256(ptr, 128)
        }
    }

    /**
     * @notice Computes an opaque unique identifier for the specified registration key and index.
     *
     * @dev This UID is indexed in transaction registration events, and can be used to an RPC node
     *      for Ethereum logs for a specific transaction registration. This allows the harbour
     *      contract to be used without event indexing with RPC nodes that do not support queries
     *      over large block ranges.
     */
    function uniqueIdentifier(
        T self,
        uint256 index
    ) internal pure returns (bytes32 uid) {
        // uid = keccak256(self, index)
        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            mstore(0, self)
            mstore(32, index)
            uid := keccak256(0, 64)
        }
    }
}
