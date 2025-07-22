// // SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.29;

import {
    PackedUserOperation
} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {ISlashingCondition} from "../interfaces/Conditions.sol";
import {PaymasterLib} from "../libs/PaymasterLib.sol";

contract SupportedHarbourCondition is ISlashingCondition {
    address public immutable SUPPORTED_HARBOUR;

    constructor(address _supportedHarbour) {
        SUPPORTED_HARBOUR = _supportedHarbour;
    }

    function shouldBeSlashed(
        address,
        PackedUserOperation calldata userOp
    ) external view override returns (bool) {
        return userOp.sender != SUPPORTED_HARBOUR;
    }
}
