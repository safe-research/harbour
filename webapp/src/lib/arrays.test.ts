// shuffle.unit.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { shuffle } from "./arrays";

afterEach(() => {
	vi.restoreAllMocks();
});

describe("shuffle (Fisher–Yates)", () => {
	it("mutates in place and returns the same reference", () => {
		const arr = [1, 2, 3, 4, 5];
		const ref = arr;

		// Force j = 0 at every step (r = 0), which yields a predictable permutation.
		const rng = vi.spyOn(Math, "random").mockReturnValue(0);

		const out = shuffle(arr);

		// same array object (in-place)
		expect(out).toBe(ref);

		// expected order when j=0 for each i:
		// i=4 -> [5,2,3,4,1]
		// i=3 -> [4,2,3,5,1]
		// i=2 -> [3,2,4,5,1]
		// i=1 -> [2,3,4,5,1]
		expect(out).toEqual([2, 3, 4, 5, 1]);

		// Fisher–Yates calls RNG exactly (n - 1) times
		expect(rng).toHaveBeenCalledTimes(arr.length - 1);
	});

	it("does nothing when random number generator always produces j=i", () => {
		const arr = [1, 2, 3, 4, 5];

		// With r ≈ 0.999..., floor((i+1)*r) === i for all i, so all swaps are no-ops.
		vi.spyOn(Math, "random").mockReturnValue(0.999999);

		const out = shuffle(arr);

		expect(out).toBe(arr); 
		expect(out).toEqual([1, 2, 3, 4, 5]);
	});

	it("handles empty arrays", () => {
		{
			const empty: number[] = [];
			const rng = vi.spyOn(Math, "random").mockReturnValue(0.5);
			const out = shuffle(empty);
			expect(out).toBe(empty);
			expect(out).toEqual([]);
			expect(rng).not.toHaveBeenCalled();
		}
    });

    it("handles single element arrays", () => {
		{
			const single = [42];
			const rng = vi.spyOn(Math, "random").mockReturnValue(0.5);
			const out = shuffle(single);
			expect(out).toBe(single);
			expect(out).toEqual([42]);
			expect(rng).not.toHaveBeenCalled();
		}
	});
});
