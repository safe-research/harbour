// // SPDX-License-Identifier: GPL-3.0-only
/* solhint-disable no-unused-import */
pragma solidity ^0.8.29;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract TestToken is ERC20 {
    constructor() ERC20("Test Token", "TST") {
        _mint(msg.sender, 1000 ether);
    }

    function mint(address beneficiary, uint256 amount) public {
        _mint(beneficiary, amount);
    }
}
