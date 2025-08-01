// // SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.29;

import {
    IPaymaster
} from "@account-abstraction/contracts/interfaces/IPaymaster.sol";
import {
    PackedUserOperation
} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";

/* solhint-disable no-empty-blocks */
contract TestPaymaster is IPaymaster {
    function validatePaymasterUserOp(
        PackedUserOperation calldata,
        bytes32,
        uint256
    ) external override returns (bytes memory, uint256) {
        // All transactions are allowed
    }

    function postOp(PostOpMode, bytes calldata, uint256, uint256) external {
        // No post op checks are performed
    }
}
