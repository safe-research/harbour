// // SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.29;

import {
    PackedUserOperation
} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {ISlashingCondition} from "../interfaces/Conditions.sol";

/**
 * @title RequireSafeTxIndicator
 * @author @rmeissner
 * @notice Condition that requires that a specific indicator is set as the refundReceiver of the SafeTx and that gasPrice is 0
 */
contract RequiredSafeTxIndicator is ISlashingCondition {
    address public immutable REQUIRED_INDICATOR;

    constructor(address _requiredIndicator) {
        REQUIRED_INDICATOR = _requiredIndicator;
    }

    function shouldBeSlashed(
        address,
        PackedUserOperation calldata userOp
    ) external view override returns (bool) {
        (
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            ,
            uint256 gasPrice,
            ,
            address refundReceiver,
            ,
            ,

        ) = abi.decode(
                userOp.callData,
                (
                    bytes32,
                    address,
                    uint256,
                    uint256,
                    address,
                    uint256,
                    bytes,
                    uint8,
                    uint256,
                    uint256,
                    uint256,
                    address,
                    address,
                    address,
                    bytes32,
                    bytes32
                )
            );
        return gasPrice == 0 && refundReceiver == REQUIRED_INDICATOR;
    }
}
