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

    function get(address safe) public view returns (SafeConfiguration memory) {
        ISafe safeContract = ISafe(safe);
        (address[] memory modules, ) = safeContract.getModulesPaginated(
            SENTINEL_MODULES,
            100
        );

        return
            SafeConfiguration({
                owners: safeContract.getOwners(),
                threshold: safeContract.getThreshold(),
                fallbackHandler: _addressFromStorage(
                    safeContract,
                    FALLBACK_HANDLER_STORAGE_SLOT
                ),
                nonce: safeContract.nonce(),
                modules: modules,
                guard: _addressFromStorage(safeContract, GUARD_STORAGE_SLOT)
            });
    }

    function _addressFromStorage(
        ISafe safeContract,
        bytes32 slot
    ) internal view returns (address) {
        return
            abi.decode(safeContract.getStorageAt(uint256(slot), 1), (address));
    }
}
