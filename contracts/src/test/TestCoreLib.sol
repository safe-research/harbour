// // SPDX-License-Identifier: GPL-3.0-only
/* solhint-disable no-unused-import */
pragma solidity ^0.8.29;

import "../libs/CoreLib.sol";

contract TestCoreLib {
    function testSplitSV(bytes32 vs) public pure returns (bytes32 s, uint8 v) {
        return CoreLib.splitVS(vs);
    }
}
