// // SPDX-License-Identifier: GPL-3.0-only
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
import "./mixins/QuotaMixin.sol";
import "./mixins/ERC4337Mixin.sol";

// TODO: do not use BasePaymaster as it is not optimized to our needs (i.e. no custom errors)
contract SafeHarbourPaymaster is BasePaymaster, QuotaMixin {
    constructor(
        address manager,
        IEntryPoint supportedEntrypoint,
        QuotaMixinConfig memory _quotaMixinconfig
    ) BasePaymaster(supportedEntrypoint) QuotaMixin(_quotaMixinconfig) {
        transferOwnership(manager);
    }

    function computeValidatorConfirmationHash(
        address harbour,
        bytes32 userOpHash
    ) internal view returns (bytes32 validatorConfirmationHash) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(uint256 chainId,address verifyingContract)"
                ),
                block.chainid,
                address(this)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "ValidatorConfirmation(address harbour,bytes32 userOpHash)"
                ),
                harbour,
                userOpHash
            )
        );
        validatorConfirmationHash = keccak256(
            abi.encodePacked("\x19\x01", domainSeparator, structHash)
        );
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

        bytes32 digest = computeValidatorConfirmationHash(
            userOp.sender,
            userOpHash
        );
        (address validator, , ) = CoreLib.recoverSigner(
            digest,
            userOp.signature
        );
        // Max quota per paymaster is ~1844ETH (2**64/10**16) in gas fees
        bool validationFailed = !_checkAndUpdateQuota(validator, maxCost);
        validationData = _packValidationData(validationFailed, 0, 0);
    }
}
