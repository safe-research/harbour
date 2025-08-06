// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.29;

import {
    BasePaymaster
} from "@account-abstraction/contracts/core/BasePaymaster.sol";
import {
    PackedUserOperation
} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {
    IEntryPoint
} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {
    _packValidationData
} from "@account-abstraction/contracts/core/Helpers.sol";
import {QuotaMixin, QuotaMixinConfig} from "./mixins/QuotaMixin.sol";
import {SlashingMixin, SlashingMixinConfig} from "./mixins/SlashingMixin.sol";
import {ERC4337Mixin} from "./mixins/ERC4337Mixin.sol";
import {PaymasterLib} from "./libs/PaymasterLib.sol";
import {CoreLib} from "./libs/CoreLib.sol";
import {InvalidTarget, InvalidUserOpPaymaster} from "./interfaces/Errors.sol";

// TODO: do not use BasePaymaster as it is not optimized to our needs (i.e. no custom errors)
contract SafeHarbourPaymaster is BasePaymaster, QuotaMixin, SlashingMixin {
    using PaymasterLib for PackedUserOperation;

    constructor(
        address manager,
        IEntryPoint supportedEntrypoint,
        QuotaMixinConfig memory _quotaMixinconfig,
        SlashingMixinConfig memory _slashingMixinconfig
    )
        BasePaymaster(supportedEntrypoint)
        QuotaMixin(_quotaMixinconfig)
        SlashingMixin(_slashingMixinconfig)
    {
        transferOwnership(manager);
    }

    function getSupportedEntrypoint()
        public
        view
        override
        returns (IEntryPoint)
    {
        return entryPoint;
    }

    /**
     * Validate a user operation.
     * @param userOp     - The user operation.
     * @param maxCost    - The maximum cost of the user operation.
     */
    function _validatePaymasterUserOp(
        PackedUserOperation calldata userOp,
        bytes32 userOpHash,
        uint256 maxCost
    ) internal override returns (bytes memory context, uint256 validationData) {
        (context);
        // TODO: check if we should also check that the sender is a supported harbour address.
        //       But this is a circular dependency, so they would have to be registered afterwards
        //       For now we rely that validators only sign for valid harbour addresses (otherwise they get slashed)

        // Theoretically this check is also performed by the 4337 mixin and could be skipped here (especially if the sender is trusted)
        require(
            bytes4(userOp.callData) == ERC4337Mixin.storeTransaction.selector,
            InvalidTarget(bytes4(userOp.callData))
        );

        require(
            userOp.extractPaymaster() == address(this),
            InvalidUserOpPaymaster()
        );

        (address validator, , ) = CoreLib.recoverSigner(
            userOpHash,
            userOp.signature
        );
        // Range will be checked by Entrypoint
        (uint48 validAfter, uint48 validUntil) = userOp.extractValidatorData();
        // Max quota per validator is ~18ETH (2**64/10**18) in gas fees
        bool validationFailed = !_checkAndUpdateQuota(validator, maxCost);
        validationData = _packValidationData(
            validationFailed,
            validUntil,
            validAfter
        );
    }

    // TODO introduce maxCostsToQuota function, to scale the costs

    // Slashing amount is based on quota and is converted back to tokens.
    function _adjustSlashingAmount(
        address validator,
        uint96 slashingAmount
    ) internal view override returns (uint96) {
        uint256 tokensToSlash = (uint256(slashingAmount) *
            10 ** QUOTA_PER_FEE_TOKEN_SCALE) / QUOTA_PER_FEE_TOKEN;
        uint96 tokenBalance = quotaStatsForSigner[validator].tokenBalance;
        // If more tokens than locked should be slashed, we slash what we can get
        return
            tokensToSlash > tokenBalance ? tokenBalance : uint96(tokensToSlash);
    }
}
