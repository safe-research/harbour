// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.29;

/**
 * @title Block Numbers
 * @notice A storage efficient list of block numbers.
 * @dev The storage layout is similar to that of an `uint64[]` dynamic array, with the exception
 *      that the first 3 elements are stored in the same slot as the array length. This is a nice
 *      optimization which makes short lists be stored in a single slot. Note that this implicitely
 *      limits blocks to the range `[0, type(uint64).max)` and length to `type(uint64).max`.
 *
 *      The layout in storage for the block numbers, given a `BlockNumbers.T` at storage slot `s`:
 *
 *                   b |  2       1       1
 *                   i |  5       9       2       6
 *                   t |  6       6       8       4       0
 *               slot\ |
 *      ---------------+-----------------------------------
 *                     |
 *                     |  +-------+-------+-------+-------+
 *                   s |  |  [2]  |  [1]  |  [0]  |  len  |
 *                     |  +-------+-------+-------+-------+
 *                     |
 *                     |  +-------+-------+-------+-------+
 *        keccak256(s) |  |  [6]  |  [5]  |  [4]  |  [3]  |
 *                     |  +-------+-------+-------+-------+
 *      keccak256(s)+1 |  |  [10] |  [9]  |  [8]  |  [7]  |
 *                     |  +-------+-------+-------+-------+
 *      keccak256(s)+2 |  |  [14] |  [12] |  [12] |  [11] |
 *                     |  +-------+-------+-------+-------+
 *                 ... |
 */
library BlockNumbers {
    /**
     * @notice A block number list storage type.
     * @dev This type is **only** intended for use as a storage variable.
     */
    struct T {
        uint256 prefix;
    }

    /**
     * @notice A block number iterator over a storage block number list.
     * @dev The fields in this type are for internal use only! This library provides functions for
     *      reading and advancing the iterator.
     */
    struct Iterator {
        // The current storage slot that was read from. Once all of the (4) block numbers from the
        // current slot are read, this value used for computing the next storage slot to read from.
        uint256 slot;
        // The data that was read from the current storage slot. This contains 4 block numbers at
        // first but shifts out one block number every time the iterator moves forward. This is
        // kept in the iterator state to prevent `sload`-ing from `slot` multiple times.
        uint256 data;
        // The remaining count in the iterator. This is initialized to the length of the block list
        // and reduced by one every time the iterator moves forward (or truncated with `take`).
        uint256 cnt;
        // The remaining blocks in the current `slot` and `data`. This is used to determine when
        // the next `slot` should be computed and `sload`-ed from.
        uint256 rem;
        // A flag that indicates that this is the "first" slot we are reading from. Solidity stores
        // the length of the array in the prefix slot, and the items in `keccak256(slot)`. In our
        // optimized list, the prefix slot stores `[2] || [1] || [0] || length`, and we need this
        // flag to know to whether the next slot is `keccak(slot)` or `slot + 1`.
        bool first;
    }

    /**
     * @notice Appends a new block number to the list.
     * @return index The index at which the new item was added.
     */
    function append(
        T storage self,
        uint256 blockNumber
    ) internal returns (uint256 index) {
        unchecked {
            uint256 prefix = self.prefix;
            index = prefix & type(uint64).max;

            // Overflow check to see if either `index + 1` or block number overflows a `uint64`,
            // and panic if it does. We use a bit-wise or to compress both checks into a single
            // comparison.
            if ((index + 1) | blockNumber > type(uint64).max) {
                _panicOverflow();
            }

            if (index < 3) {
                // The block number is stored in the prefix slot. Compute the shift so that the
                // block ends up in the right bits of the 32-byte word:
                //
                // b  2       1       1
                // i  5       9       2       6
                // t  6       6       8       4       0
                //    +-------+-------+-------+-------+
                //    |  [2]  |  [1]  |  [0]  |  len  |
                //    +-------+-------+-------+-------+

                uint256 shift = (index + 1) << 6; // (index + 1) * 64
                self.prefix = (prefix + 1) | (blockNumber << shift); // len++; [index] = blockNumber
            } else {
                // The block number is stored in one of the value slots. We need to compute both the
                // value slot where the item is, accounting for the fact that only 3 items fit in
                // the prefix slot, and 4 items fit in each value slot thereafter:
                //
                // b  2       1       1
                // i  5       9       2       6
                // t  6       6       8       4       0
                //    +-------+-------+-------+-------+
                //    | [i+3] | [i+2] | [i+1] |  [i]  |
                //    +-------+-------+-------+-------+

                uint256 j = index - 3; // discount the first 3 items from the prefix slot.
                uint256 offset = j >> 2; // (j / 4): is the value slot offset
                uint256 shift = (j & 3) << 6; // (j % 4) * 64

                // sstore[keccak256(self.slot) + offset] |= blockNumber << shift
                // solhint-disable-next-line no-inline-assembly
                assembly ("memory-safe") {
                    mstore(0, self.slot)
                    let slot := add(keccak256(0, 32), offset)
                    sstore(slot, or(sload(slot), shl(shift, blockNumber)))
                }
                self.prefix = prefix + 1; // len++
            }
        }
    }

    /**
     * @notice Get the length of the block numbers list.
     */
    function len(T storage self) internal view returns (uint256 length) {
        return self.prefix & type(uint64).max;
    }

    /**
     * @notice Create an iterator over the block numbers.
     * @dev The iterator is implemented to minimize storage reads.
     */
    function iter(T storage self) internal view returns (Iterator memory it) {
        // it.slot = self.slot
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
     * @notice Moves the iterator to the next block number.
     */
    function next(Iterator memory self) internal view returns (bool remaining) {
        remaining = self.cnt != 0;
        // We implement `next` by skipping one value. This removes a lot of duplicate code. Note
        // that, generally, callers are MUST NOT expect `value` to be valid after `skip`-ing, and
        // the fact we use `skip` in `next` is an implementation detail.
        skip(self, 1);
    }

    /**
     * @notice Skips items in the iterator.
     * @dev `next` MUST be called after `skip`-ing.
     */
    function skip(Iterator memory self, uint256 n) internal view {
        // If we skip past the end of the iterator, then the iterator is done and there is nothing
        // else to do! The next call to `next` will return `false` meaning that there are no more
        // values.
        if (self.cnt < n) {
            self.cnt = 0;
            return;
        }

        unchecked {
            self.cnt -= n;
            if (self.rem >= n) {
                // We skipped some amount that is smaller than the number of items remaining in the
                // last `sload`-ed `data`. We just need to shift out the values that were skipped
                // and adjust the `rem`-aining item amount accordingly.

                self.data = self.data >> (n << 6); // data >> (n * 64)
                self.rem -= n;
            } else {
                // HERE BE DRAGONS. We skipped some amount of items that requires us to `sload` some
                // new `data` from a different `slot`. We also need to update `rem` and `data`, as
                // we may have skipped somewhere in the middle of a value slot.

                // Figure out how many additional items we need to skip past the last item remaining
                // in the `data` from the last `sload`-ed slot. It makes computations below simpler.
                n -= self.rem;

                // We know that we moved **at least** 1 slot forward, but we need to figure out
                // exactly how many additional slots forward we went (for example, if we `skip(100)`
                // we have to read way past the next `slot`). Since _only_ the prefix (fist) slot
                // fits 3 items and we are here if we moved past it, we can compute the additional
                // slots to skip assuming exactly 4 items per slot.
                uint256 slots = n >> 2; // slots = n / 4
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

                // Now we need to compute where we landed in the of the `slot`, and adjust both
                // `rem` and `data` accordingly (to handle the case where we skip somewhere in
                // the middle of a value slot).
                self.rem = 4 - (n & 3); // rem = 4 - (n % 4)
                uint256 shift = (3 - self.rem) << 6; // shift = (3 - rem) * 64

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
     * @dev The caller MUST ONLY call this function after a call to `next` which returned `true`.
     *      Calling this after initialization (`iter`) or `skip` is undefined behaviour.
     */
    function value(
        Iterator memory self
    ) internal pure returns (uint256 blockNumber) {
        return self.data & type(uint64).max;
    }

    /**
     * @dev Generate an overflow panic. This function is required and implemented in assembly since
     *      Solidity does not support panicking with `revert Panic(0x11)`.
     *
     *      <https://docs.soliditylang.org/en/v0.8.29/control-structures.html#panic-via-assert-and-error-via-require>
     */
    function _panicOverflow() private pure {
        // revert Panic(0x11)
        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            mstore(0, 0x4e487b71) // Panic(uint256)
            mstore(32, 0x11) // arithmetic underflow or overflow
            revert(28, 36)
        }
    }
}
