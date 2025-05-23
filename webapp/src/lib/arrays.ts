/**
 * Randomly shuffles the elements of the given array in place using the
 * Fisher–Yates algorithm and returns the same array.
 *
 * This implementation mutates the original array. To preserve the original,
 * pass in a copy (e.g., array.slice()).
 *
 * @template T
 * @param {T[]} array - The array to shuffle.
 * @returns {T[]} The shuffled array (same reference as the input).
 *
 * @example
 * const nums = [1, 2, 3, 4, 5];
 * shuffle(nums);
 * console.log(nums); // e.g. [3, 5, 1, 4, 2]
 */
function shuffle<T>(array: T[]): T[] {
	for (let i = array.length - 1; i > 0; i--) {
		// j is a random integer such that 0 ≤ j ≤ i
		const j = Math.floor(Math.random() * (i + 1));
		// Swap elements array[i] and array[j]
		[array[i], array[j]] = [array[j], array[i]];
	}
	return array;
}

export { shuffle };
