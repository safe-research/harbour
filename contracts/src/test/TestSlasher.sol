// // SPDX-License-Identifier: GPL-3.0-only
/* solhint-disable no-unused-import */
pragma solidity ^0.8.29;

import {SlashingMixin, SlashingMixinConfig} from "../mixins/SlashingMixin.sol";
import {IEntryPoint} from "../interfaces/ERC4337.sol";

contract TestSlasher is SlashingMixin {
    error TestOverQuota();

    address public immutable SUPPORTED_ENTRYPOINT;
    address public immutable FEE_TOKEN;

    constructor(
        address _entryPoint,
        address _feeToken,
        SlashingMixinConfig memory _config
    ) SlashingMixin(_config) {
        FEE_TOKEN = _feeToken;
        SUPPORTED_ENTRYPOINT = _entryPoint;
    }

    function getSupportedEntrypoint()
        public
        view
        override
        returns (IEntryPoint)
    {
        return IEntryPoint(SUPPORTED_ENTRYPOINT);
    }

    function _checkAndUpdateQuota(
        address,
        uint256
    ) internal pure override returns (bool) {
        revert("Should not be used");
    }

    function _withdrawSignerTokens(
        address signer,
        address beneficiary,
        uint128 amount,
        bool skipResetCheck
    ) internal override {
        revert("Should not be used");
    }

    function _transferFeeToken(
        address beneficiary,
        uint128 amount
    ) internal override {
        revert("Should not be used");
    }

    function _adjustSlashingAmount(
        address,
        uint128 slashingAmount
    ) internal override returns (uint128) {
        return slashingAmount;
    }
}
