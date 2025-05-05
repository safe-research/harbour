// SPDX-License-Identifier: GNU GPLv3
pragma solidity ^0.8.29;

struct SafeConfiguration {
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

contract SafeConfigurationFetcher {
    // keccak256("fallback_manager.handler.address")
    bytes32 internal constant FALLBACK_HANDLER_STORAGE_SLOT =
        0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5;

    // keccak256("guard_manager.guard.address")
    bytes32 internal constant GUARD_STORAGE_SLOT =
        0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8;

    // SENTINEL_MODULES is used to traverse `modules`, so that:
    //      1. `modules[SENTINEL_MODULES]` contains the first module
    //      2. `modules[last_module]` points back to SENTINEL_MODULES
    address internal constant SENTINEL_MODULES = address(0x1);

    function _addressFromStorage(
        ISafe safeContract,
        bytes32 slot
    ) internal view returns (address) {
        return
            abi.decode(safeContract.getStorageAt(uint256(slot), 1), (address));
    }

    /// @notice Returns the basic Safe configuration (excluding modules).
    function getBasicConfiguration(
        address safe
    ) external view returns (SafeConfiguration memory config) {
        ISafe safeContract = ISafe(safe);
        config.owners = safeContract.getOwners();
        config.threshold = safeContract.getThreshold();
        config.fallbackHandler = _addressFromStorage(
            safeContract,
            FALLBACK_HANDLER_STORAGE_SLOT
        );
        config.nonce = safeContract.nonce();
        config.guard = _addressFromStorage(safeContract, GUARD_STORAGE_SLOT);
    }

    /// @notice Returns a page of Safe modules and the next cursor.
    function getModulesPaginated(
        address safe,
        address start,
        uint256 pageSize
    ) external view returns (address[] memory modulePage, address next) {
        return ISafe(safe).getModulesPaginated(start, pageSize);
    }

    /// @notice Returns the full Safe configuration (including all modules via pagination, up to a safety cap).
    function getFullConfiguration(
        address safe,
        uint256 maxIterations,
        uint256 pageSize
    )
        external
        view
        returns (SafeConfiguration memory config, address nextCursor)
    {
        ISafe safeContract = ISafe(safe);
        // populate basic config fields
        config.owners = safeContract.getOwners();
        config.threshold = safeContract.getThreshold();
        config.fallbackHandler = _addressFromStorage(
            safeContract,
            FALLBACK_HANDLER_STORAGE_SLOT
        );
        config.nonce = safeContract.nonce();
        config.guard = _addressFromStorage(safeContract, GUARD_STORAGE_SLOT);

        // temporary buffer to collect modules
        address[] memory temp = new address[](maxIterations * pageSize);
        uint256 count = 0;
        address cursor = SENTINEL_MODULES;

        // paginate through modules up to maxIterations
        for (uint256 i = 0; i < maxIterations && cursor != address(0); i++) {
            (address[] memory page, address next) = safeContract
                .getModulesPaginated(cursor, pageSize);
            for (uint256 j = 0; j < page.length; j++) {
                temp[count++] = page[j];
            }
            cursor = next;
        }

        // trim buffer to actual size
        address[] memory modulesArr = new address[](count);
        for (uint256 k = 0; k < count; k++) {
            modulesArr[k] = temp[k];
        }

        config.modules = modulesArr;
        nextCursor = cursor;
    }
}
