// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.29;

import {SlashingMixin, SlashingMixinConfig} from "../mixins/SlashingMixin.sol";
import {IEntryPoint} from "../interfaces/ERC4337.sol";
import {NotImplemented} from "./TestErrors.sol";

/* solhint-disable no-empty-blocks */
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
        revert NotImplemented();
    }

    function _withdrawSignerTokens(
        address,
        address,
        uint96,
        bool
    ) internal pure override {
        // noop
    }

    function _transferFeeToken(address, uint96) internal pure override {
        revert NotImplemented();
    }

    function _adjustSlashingAmount(
        address,
        uint96 slashingAmount
    ) internal pure override returns (uint96) {
        return slashingAmount;
    }
}
