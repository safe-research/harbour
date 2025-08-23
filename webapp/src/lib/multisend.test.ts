import { describe, expect, it } from "vitest";
import { encodeMultiSend, MULTISEND_CALL_ONLY_ADDRESS } from "./multisend";
import type { MetaTransaction } from "./types";

describe("multisend encoding", () => {
	it("returns 0x for an empty array", () => {
		expect(encodeMultiSend([])).toBe("0x");
	});

	it("encodes a single meta transaction correctly", () => {
		const tx: MetaTransaction = {
			to: "0x000000000000000000000000000000000000dEaD",
			value: 0n,
			data: "0x", // no calldata
		};

		const EXPECTED =
			"0x00000000000000000000000000000000000000dead00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000";
		const actual = encodeMultiSend([tx]);

		expect(actual).toBe(EXPECTED);
	});

	it("concatenates multiple meta transactions", () => {
		const tx1: MetaTransaction = {
			to: "0x000000000000000000000000000000000000dEaD",
			value: 0n,
			data: "0x",
		};
		const tx2: MetaTransaction = {
			to: "0x000000000000000000000000000000000000bEEF",
			value: 123n,
			data: "0xabcdef", // 3 bytes
		};

		const EXPECTED =
			"0x00000000000000000000000000000000000000dead0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000beef000000000000000000000000000000000000000000000000000000000000007b0000000000000000000000000000000000000000000000000000000000000003abcdef";
		const actual = encodeMultiSend([tx1, tx2]);

		expect(actual).toBe(EXPECTED);
	});

	it("includes value and data length in the encoding (changes when value changes)", () => {
		const base: Omit<MetaTransaction, "value"> = {
			to: "0x000000000000000000000000000000000000bEEF",
			data: "0x1234", // 2 bytes
		};

		const encA = encodeMultiSend([{ ...base, value: 0n }]);
		const encB = encodeMultiSend([{ ...base, value: 1n }]);

		expect(encA).not.toBe(encB); // value field affects encoding
	});

	it("exports the correct MULTISEND_CALL_ONLY_ADDRESS", () => {
		expect(MULTISEND_CALL_ONLY_ADDRESS).toBe(
			"0x9641d764fc13c8B624c04430C7356C1C7C8102e2",
		);
	});
});
