// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.29;
import {
    IEntryPoint
} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";

abstract contract IERC4337InfoProvider {
    function getSupportedEntrypoint() public view virtual returns (IEntryPoint);
}
