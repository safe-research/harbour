// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.29;

import {BlockNumbers} from "../libs/BlockNumbers.sol";

contract TestBlockNumbers {
    using BlockNumbers for *;

    BlockNumbers.T private blocks;
    BlockNumbers.Iterator private iterator;

    function testAppend(uint256 blockNumber) external returns (uint256 index) {
        return blocks.append(blockNumber);
    }

    function testLen() external view returns (uint256 length) {
        return blocks.len();
    }

    function testIter()
        external
        view
        returns (BlockNumbers.Iterator memory it)
    {
        return blocks.iter();
    }

    function testCount(
        BlockNumbers.Iterator memory it
    ) external pure returns (uint256 count) {
        return it.count();
    }

    function testNext(
        BlockNumbers.Iterator memory it
    ) external view returns (BlockNumbers.Iterator memory itt, bool remaining) {
        itt = it;
        remaining = itt.next();
    }

    function testSkip(
        BlockNumbers.Iterator memory it,
        uint256 n
    ) external view returns (BlockNumbers.Iterator memory itt) {
        itt = it;
        itt.skip(n);
    }

    function testTake(
        BlockNumbers.Iterator memory it,
        uint256 n
    ) external pure returns (BlockNumbers.Iterator memory itt) {
        itt = it;
        itt.take(n);
    }

    function testValue(
        BlockNumbers.Iterator memory it
    ) external pure returns (uint256 blockNumber) {
        return it.value();
    }

    function testSlice(
        uint256 start,
        uint256 count
    ) external view returns (uint256[] memory blockNumbers) {
        BlockNumbers.Iterator memory it = blocks.iter();
        it.skip(start);
        it.take(count);

        blockNumbers = new uint256[](it.count());
        for (uint256 i = 0; it.next(); i++) {
            blockNumbers[i] = it.value();
        }
    }
}
