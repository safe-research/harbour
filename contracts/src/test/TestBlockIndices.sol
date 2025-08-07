// SPDX-License-Identifier: GPL-3.0-only
/* solhint-disable no-unused-import */
pragma solidity ^0.8.29;

import {BlockIndices} from "../libs/BlockIndices.sol";

contract TestBlockIndices {
    using BlockIndices for *;

    BlockIndices.T private blocks;
    BlockIndices.Iterator private iterator;

    function testAppend(uint256 blockIndex) external returns (uint256 index) {
        return blocks.append(blockIndex);
    }

    function testLen() external view returns (uint256 length) {
        return blocks.len();
    }

    function testIter()
        external
        view
        returns (BlockIndices.Iterator memory it)
    {
        return blocks.iter();
    }

    function testCount(
        BlockIndices.Iterator memory it
    ) external pure returns (uint256 count) {
        return it.count();
    }

    function testNext(
        BlockIndices.Iterator memory it
    ) external view returns (BlockIndices.Iterator memory itt, bool remaining) {
        itt = it;
        remaining = itt.next();
    }

    function testSkip(
        BlockIndices.Iterator memory it,
        uint256 n
    ) external view returns (BlockIndices.Iterator memory itt) {
        itt = it;
        itt.skip(n);
    }

    function testTake(
        BlockIndices.Iterator memory it,
        uint256 n
    ) external pure returns (BlockIndices.Iterator memory itt) {
        itt = it;
        itt.take(n);
    }

    function testValue(
        BlockIndices.Iterator memory it
    ) external pure returns (uint256 blockIndex) {
        return it.value();
    }

    function testSlice(
        uint256 start,
        uint256 count
    ) external view returns (uint256[] memory blockIndices) {
        BlockIndices.Iterator memory it = blocks.iter();
        it.skip(start);
        it.take(count);

        blockIndices = new uint256[](it.count());
        for (uint256 i = 0; it.next(); i++) {
            blockIndices[i] = it.value();
        }
    }
}
