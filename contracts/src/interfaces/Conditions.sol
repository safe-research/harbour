// // SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.29;

import {
    PackedUserOperation
} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";

interface ISlashingCondition {
    function shouldBeSlashed(
        address validator,
        PackedUserOperation calldata userOp
    ) external returns (bool);
}
