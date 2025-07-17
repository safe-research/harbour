// // SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.29;

import {
    PackedUserOperation
} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IQuotaManager} from "../interfaces/QuotaManager.sol";
import {PaymasterLib} from "../libs/PaymasterLib.sol";
import {CoreLib} from "../libs/CoreLib.sol";
import {IERC4337InfoProvider} from "../interfaces/ERC4337.sol";
import {ISlashingCondition} from "../interfaces/Conditions.sol";
import {InvalidUserOpPaymaster} from "../interfaces/Errors.sol";

struct SlashingMixinConfig {
    uint48 enableCoditionsDelay;
    ISlashingCondition[] initialConditions;
}

abstract contract SlashingMixin is IQuotaManager, IERC4337InfoProvider {
    using SafeERC20 for IERC20;
    using PaymasterLib for PackedUserOperation;

    struct ConditionStatus {
        uint48 enabledAfter;
        uint48 enabledUntil;
    }

    uint48 public immutable ENABLE_CONDITIONS_DELAY;

    event Slashed(
        ISlashingCondition indexed offendingCondition,
        address indexed validator,
        uint256 indexed amount
    );

    event EnableCondition(
        ISlashingCondition indexed offendingCondition,
        uint48 enabledFrom
    );

    event DisableCondition(
        ISlashingCondition indexed offendingCondition,
        uint48 enabledUntil
    );

    uint256 public slashedTokens;
    mapping(ISlashingCondition => ConditionStatus) public enabledConditions;
    mapping(bytes32 => uint256) public slashedUserOps;

    constructor(SlashingMixinConfig memory _config) {
        ENABLE_CONDITIONS_DELAY = _config.enableCoditionsDelay;
        for (uint256 i = 0; i < _config.initialConditions.length; i++) {
            enabledConditions[_config.initialConditions[i]] = ConditionStatus({
                enabledAfter: uint48(block.timestamp),
                enabledUntil: 0
            });
        }
    }

    function slashValidator(
        ISlashingCondition offendingCondition,
        PackedUserOperation calldata userOp
    ) public {
        // Only slashing for userOps related to this paymaster is allowed
        require(
            userOp.extractPaymaster() == address(this),
            InvalidUserOpPaymaster()
        );
        (uint256 validAfter, uint256 validUntil) = userOp
            .extractValidatorData();
        ConditionStatus memory conditionStatus = enabledConditions[
            offendingCondition
        ];
        require(
            (conditionStatus.enabledAfter < validUntil || validUntil == 0) &&
                (validAfter < conditionStatus.enabledUntil ||
                    conditionStatus.enabledUntil == 0),
            "Condition not active"
        );
        bytes32 userOpHash = getSupportedEntrypoint().getUserOpHash(userOp);
        bytes32 digest = PaymasterLib.computeValidatorConfirmationHash(
            userOp.sender,
            userOpHash
        );
        (address validator, , ) = CoreLib.recoverSigner(
            digest,
            userOp.signature
        );
        require(
            offendingCondition.shouldBeSlashed(validator, userOp),
            "UserOp does not offend the condition"
        );
        require(slashedUserOps[userOpHash] == 0, "UserOp was already slashed");
        uint128 usedQuota = uint128(userOp.calculateRequiredPrefund());
        uint128 slashingAmount = _adjustSlashingAmount(validator, usedQuota);
        require(slashingAmount > 0, "Nothing to slash");
        // Currently only the slashed amount is stored, more information could be stored if necessary
        slashedUserOps[userOpHash] = slashingAmount;
        slashedTokens += slashingAmount;
        // By withdrawing the slashed tokens to the slashing contract they can be transferred later
        _withdrawSignerTokens(validator, address(this), slashingAmount, true);
        emit Slashed(offendingCondition, validator, slashingAmount);
    }

    // Can be used to adjust slashing amount, i.e. based on quota relation
    function _adjustSlashingAmount(
        address,
        uint128 slashingAmount
    ) internal virtual returns (uint128);

    function _enableCondition(ISlashingCondition condition) internal {
        require(
            enabledConditions[condition].enabledAfter == 0,
            "Condition already enabled"
        );
        uint48 enabledAfter = uint48(block.timestamp) + ENABLE_CONDITIONS_DELAY;
        enabledConditions[condition] = ConditionStatus({
            enabledAfter: enabledAfter,
            enabledUntil: 0
        });
        emit EnableCondition(condition, enabledAfter);
    }

    function _disableCondition(ISlashingCondition condition) internal {
        ConditionStatus memory conditionStatus = enabledConditions[condition];
        require(conditionStatus.enabledAfter != 0, "Condition not enabled");
        require(
            conditionStatus.enabledUntil == 0,
            "Condition already disabled"
        );
        uint48 enabledUntil = uint48(block.timestamp) + ENABLE_CONDITIONS_DELAY;
        enabledConditions[condition].enabledUntil = enabledUntil;
        emit EnableCondition(condition, enabledUntil);
    }

    function _withdrawSlashedTokens(
        address beneficiary,
        uint128 amount
    ) internal {
        require(
            beneficiary != address(this),
            "Cannot transfer to this account"
        );
        require(amount <= slashedTokens, "Amount too high");
        unchecked {
            slashedTokens -= amount;
        }
        _transferFeeToken(beneficiary, amount);
    }
}
