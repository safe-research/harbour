// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.29;

/**
 * @title Block Indices
 * @notice A storage efficient list of block indices.
 * @dev The storage layout is similar to that of an `uint64[]` dynamic array, with the exception
 *      that the first 3 elements are stored in the same slot as the array length. This is a nice
 *      optimization which makes short lists be stored in a single slot. Note that this implicitely
 *      limits blocks to the range `[0, type(uint64).max)` and length to `type(uint64).max`.
 */
library BlockIndices {
    struct T {
        uint256 prefix;
    }

    struct Iterator {
        uint256 slot;
        uint256 data;
        uint256 cnt;
        uint256 rem;
        bool first;
    }

    /**
     * @notice Appends a new block index to the list.
     * @return index The index at which the new item was added.
     */
    function append(
        T storage self,
        uint256 blockIndex
    ) internal returns (uint256 index) {
        unchecked {
            uint256 prefix = self.prefix;
            index = prefix & type(uint64).max;
            if ((index + 1) | blockIndex > type(uint64).max) {
                _panicOverflow();
            }

            if (index < 3) {
                uint256 shift = (index + 1) << 6;
                self.prefix = (prefix + 1) | (blockIndex << shift);
            } else {
                uint256 j = index - 3;
                uint256 offset = j >> 2;
                uint256 shift = (j & 3) << 6;
                // sstore[keccak256(self.slot) + offset] |= blockIndex << shift
                // solhint-disable-next-line no-inline-assembly
                assembly ("memory-safe") {
                    mstore(0, self.slot)
                    let slot := add(keccak256(0, 32), offset)
                    sstore(slot, or(sload(slot), shl(shift, blockIndex)))
                }
                self.prefix = prefix + 1;
            }
        }
    }

    /**
     * @notice Get the length of the block index list.
     */
    function len(T storage self) internal view returns (uint256 length) {
        return self.prefix & type(uint64).max;
    }

    /**
     * @notice Create an iterator over the block indices.
     * @dev The iterator is implemented to minimize storage reads.
     */
    function iter(T storage self) internal view returns (Iterator memory it) {
        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            mstore(it, self.slot)
        }
        unchecked {
            it.data = self.prefix;
            // TODO(nlordell): If we _really_ want to optimize, we can pack `cnt`, `rem` and
            // `first` into a single slot, but that isn't necessary for now.
            it.cnt = it.data & type(uint64).max;
            it.rem = 3;
            it.first = true;
        }
    }

    /**
     * @notice Returns the count of remaining items in the iterator.
     */
    function count(
        Iterator memory self
    ) internal pure returns (uint256 length) {
        return self.cnt;
    }

    /**
     * @notice Moves the iterator to the next block index.
     */
    function next(Iterator memory self) internal view returns (bool remaining) {
        remaining = self.cnt != 0;
        skip(self, 1);
    }

    /**
     * @notice Skips items in the iterator.
     */
    function skip(Iterator memory self, uint256 n) internal view {
        if (self.cnt < n) {
            self.cnt = 0;
            return;
        }

        unchecked {
            self.cnt -= n;
            if (self.rem >= n) {
                self.data = self.data >> (n << 6);
                self.rem -= n;
            } else {
                n -= self.rem;
                uint256 slots = n >> 2;
                if (self.first) {
                    // self.slot = keccak256(abi.encode(self.slot)) + slots;
                    // solhint-disable-next-line no-inline-assembly
                    assembly ("memory-safe") {
                        mstore(self, add(keccak256(self, 32), slots))
                    }
                    self.first = false;
                } else {
                    self.slot += 1 + slots;
                }
                self.rem = 4 - (n & 3);
                uint256 shift = (3 - self.rem) << 6;
                // self.data = sload(self.slot) >> shift
                // solhint-disable-next-line no-inline-assembly
                assembly ("memory-safe") {
                    mstore(add(self, 32), shr(shift, sload(mload(self))))
                }
            }
        }
    }

    /**
     * @notice Truncates the iterator to a maximum of `cnt` items.
     */
    function take(Iterator memory self, uint256 cnt) internal pure {
        if (self.cnt > cnt) {
            self.cnt = cnt;
        }
    }

    /**
     * @notice Returns the current value of the iterator.
     * @dev The caller must only call this function after a call to `next` which returned `true`.
     */
    function value(
        Iterator memory self
    ) internal pure returns (uint256 blockIndex) {
        return self.data & type(uint64).max;
    }

    /**
     * @dev Generate an overflow panic.
     *      <https://docs.soliditylang.org/en/v0.8.29/control-structures.html#panic-via-assert-and-error-via-require>
     */
    function _panicOverflow() private pure {
        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            mstore(0, 0x4e487b71) // Panic(uint256)
            mstore(32, 0x11) // arithmetic underflow or overflow
            revert(28, 36)
        }
    }
}
