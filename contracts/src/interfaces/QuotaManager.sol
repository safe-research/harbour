// // SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.29;

abstract contract IQuotaManager {
    function _checkAndUpdateQuota(
        address signer,
        uint256 requiredQuota
    ) internal virtual returns (bool);

    function _withdrawSignerTokens(
        address signer,
        address beneficiary,
        uint128 amount,
        bool ignoreReset
    ) internal virtual;

    function _transferFeeToken(
        address beneficiary,
        uint128 amount
    ) internal virtual;
}
