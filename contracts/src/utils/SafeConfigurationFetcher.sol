// SPDX-License-Identifier: GNU GPLv3
pragma solidity ^0.8.29;

/// @notice Data structure representing a Safe configuration.
/// @param owners The list of Safe owners.
/// @param threshold Required confirmations for transactions.
/// @param fallbackHandler Fallback handler contract address.
/// @param nonce Current nonce of the Safe.
/// @param modules Enabled Safe modules.
/// @param guard Guard contract address.
struct SafeConfiguration {
    address singleton;
    address[] owners;
    uint256 threshold;
    address fallbackHandler;
    uint256 nonce;
    address[] modules;
    address guard;
}

interface ISafe {
    function getOwners() external view returns (address[] memory);

    function getThreshold() external view returns (uint256);

    function getStorageAt(
        uint256 offset,
        uint256 length
    ) external view returns (bytes memory);

    function nonce() external view returns (uint256);

    function getModulesPaginated(
        address start,
        uint256 pageSize
    ) external view returns (address[] memory array, address next);

    function getModules() external view returns (address[] memory);
}

/// @title Safe Configuration Fetcher
/// @notice A utility contract to fetch basic and full configurations of a Safe.
/// @dev Provides gas-optimized methods for reading storage and modules with pagination.
contract SafeConfigurationFetcher {
    /// @dev Storage slot for singleton
    bytes32 internal constant SINGLETON_STORAGE_SLOT = 0;

    /// @dev Storage slot for fallback handler (keccak256("fallback_manager.handler.address")).
    bytes32 internal constant FALLBACK_HANDLER_STORAGE_SLOT =
        0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5;

    /// @dev Storage slot for guard contract (keccak256("guard_manager.guard.address")).
    bytes32 internal constant GUARD_STORAGE_SLOT =
        0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8;

    /// @dev Sentinel address for module linked-list iteration.
    address internal constant SENTINEL_MODULES = address(0x1);

    /// @dev Internal helper to read an address from a specific storage slot.
    /// @param safeContract The Safe contract to query.
    /// @param slot The storage slot to read.
    /// @return addr The address value decoded from the slot.
    function _addressFromStorage(
        ISafe safeContract,
        bytes32 slot
    ) internal view returns (address addr) {
        addr = abi.decode(
            safeContract.getStorageAt(uint256(slot), 1),
            (address)
        );
    }

    /// @dev Internal helper to fetch the basic configuration fields from the Safe.
    /// @param safeContract The Safe contract instance.
    /// @return config SafeConfiguration struct with owners, threshold, fallbackHandler, nonce, and guard populated.
    function _fetchBasicConfig(
        ISafe safeContract
    ) private view returns (SafeConfiguration memory config) {
        config.singleton = _addressFromStorage(
            safeContract,
            SINGLETON_STORAGE_SLOT
        );
        config.owners = safeContract.getOwners();
        config.threshold = safeContract.getThreshold();
        config.fallbackHandler = _addressFromStorage(
            safeContract,
            FALLBACK_HANDLER_STORAGE_SLOT
        );
        config.nonce = safeContract.nonce();
        config.guard = _addressFromStorage(safeContract, GUARD_STORAGE_SLOT);
    }

    /// @notice Returns the basic Safe configuration (excluding modules, modules array will be empty).
    /// @param safe The address of the Safe contract.
    /// @return config The basic SafeConfiguration with owners, threshold, fallbackHandler, nonce, guard, and an empty modules array.
    function getBasicConfiguration(
        address safe
    ) external view returns (SafeConfiguration memory config) {
        config = _fetchBasicConfig(ISafe(safe));
    }

    /// @notice Returns a page of Safe modules and the next cursor for pagination.
    /// @param safe The address of the Safe contract.
    /// @param start The starting module address (use SENTINEL_MODULES for first page).
    /// @param pageSize The maximum number of modules to retrieve.
    /// @return modulePage List of module addresses in the retrieved page.
    /// @return nextCursor Address cursor for the next page (address(0) if end reached).
    function getModulesPaginated(
        address safe,
        address start,
        uint256 pageSize
    ) external view returns (address[] memory modulePage, address nextCursor) {
        (modulePage, nextCursor) = ISafe(safe).getModulesPaginated(
            start,
            pageSize
        );
    }

    /// @notice Returns the full Safe configuration, including all modules up to the specified cap.
    /// @param safe The address of the Safe contract.
    /// @param maxIterations Maximum number of pagination loops.
    /// @param pageSize Number of modules to fetch per iteration.
    /// @return fullConfig Complete SafeConfiguration with modules populated.
    /// @return nextCursor Cursor for additional pagination (address(0) if none left).
    function getFullConfiguration(
        address safe,
        uint256 maxIterations,
        uint256 pageSize
    )
        public
        view
        returns (SafeConfiguration memory fullConfig, address nextCursor)
    {
        ISafe safeContract = ISafe(safe);
        fullConfig = _fetchBasicConfig(safeContract);

        uint256 bufferSize = maxIterations * pageSize;
        address[] memory temp = new address[](bufferSize);
        uint256 count = 0;
        address cursor = SENTINEL_MODULES;

        for (
            uint256 i = 0;
            i < maxIterations &&
                (i == 0 ||
                    (cursor != address(0) && cursor != SENTINEL_MODULES));
            i++
        ) {
            (address[] memory page, address next) = safeContract
                .getModulesPaginated(cursor, pageSize);
            for (uint256 j = 0; j < page.length; j++) {
                temp[count++] = page[j];
            }
            cursor = next;
        }

        address[] memory modulesArr = new address[](count);
        for (uint256 k = 0; k < count; k++) {
            modulesArr[k] = temp[k];
        }
        fullConfig.modules = modulesArr;
        nextCursor = cursor;
    }

    /// @notice Returns full configurations for multiple Safe contracts in a single call.
    /// @param safes Array of Safe contract addresses to query.
    /// @param maxIterations Maximum number of pagination loops for each Safe.
    /// @param pageSize Number of modules to fetch per iteration for each Safe.
    /// @return fullConfigs Array of complete SafeConfiguration structs, one for each Safe address.
    /// @return nextCursors Array of cursors for additional pagination (address(0) if none left).
    function getFullConfigurationMany(
        address[] calldata safes,
        uint256 maxIterations,
        uint256 pageSize
    )
        external
        view
        returns (
            SafeConfiguration[] memory fullConfigs,
            address[] memory nextCursors
        )
    {
        fullConfigs = new SafeConfiguration[](safes.length);
        nextCursors = new address[](safes.length);

        for (uint256 i = 0; i < safes.length; i++) {
            (fullConfigs[i], nextCursors[i]) = getFullConfiguration(
                safes[i],
                maxIterations,
                pageSize
            );
        }
    }
}
