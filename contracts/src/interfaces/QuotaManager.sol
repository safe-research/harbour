// SPDX-License-Identifier: GNU GPLv3
pragma solidity ^0.8.29;

abstract contract IQuotaManager {
    function _checkAndUpdateQuota(
        address signer,
        uint256 requiredQuota
    ) internal virtual returns (bool);
}
