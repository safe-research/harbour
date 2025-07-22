// // SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.29;

import {
    UserOperationLib
} from "@account-abstraction/contracts/core/UserOperationLib.sol";
import {
    PackedUserOperation
} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";

library PaymasterLib {
    using UserOperationLib for PackedUserOperation;

    uint256 private constant PAYMASTER_VALID_AFTER_END =
        UserOperationLib.PAYMASTER_DATA_OFFSET + 6;
    uint256 private constant PAYMASTER_VALID_UNTIL_END =
        PAYMASTER_VALID_AFTER_END + 6;

    function extractValidatorData(
        PackedUserOperation calldata userOp
    ) internal pure returns (uint48 validAfter, uint48 validUntil) {
        require(
            userOp.paymasterAndData.length >= PAYMASTER_VALID_UNTIL_END,
            "Invalid Validator Data"
        );
        validAfter = uint48(
            bytes6(
                userOp.paymasterAndData[
                    UserOperationLib
                        .PAYMASTER_DATA_OFFSET:PAYMASTER_VALID_AFTER_END
                ]
            )
        );
        validUntil = uint48(
            bytes6(
                userOp.paymasterAndData[
                    PAYMASTER_VALID_AFTER_END:PAYMASTER_VALID_UNTIL_END
                ]
            )
        );
    }

    function extractPaymaster(
        PackedUserOperation calldata userOp
    ) internal pure returns (address paymaster) {
        return
            address(
                bytes20(
                    userOp.paymasterAndData[
                        :UserOperationLib.PAYMASTER_VALIDATION_GAS_OFFSET
                    ]
                )
            );
    }

    function calculateRequiredPrefund(
        PackedUserOperation calldata userOp
    ) internal pure returns (uint256 requiredPrefund) {
        unchecked {
            uint256 callGasLimit = userOp.unpackCallGasLimit();
            uint256 verificationGasLimit = userOp.unpackVerificationGasLimit();
            uint256 paymasterVerificationGasLimit = userOp
                .unpackPaymasterVerificationGasLimit();
            uint256 paymasterPostOpGasLimit = userOp.unpackPostOpGasLimit();
            uint256 maxFeePerGas = userOp.unpackMaxFeePerGas();
            uint256 requiredGas = verificationGasLimit +
                callGasLimit +
                paymasterVerificationGasLimit +
                paymasterPostOpGasLimit +
                userOp.preVerificationGas;

            requiredPrefund = requiredGas * maxFeePerGas;
        }
    }

    // TODO: harbour is userOp.sender and therefore part of userOpHash and could be removed
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
}
