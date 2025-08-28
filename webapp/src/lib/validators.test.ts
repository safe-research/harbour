import { describe, expect, it } from "vitest";
import {
	chainIdSchema,
	checkedAddressSchema,
	ETHEREUM_ADDRESS_REGEX,
	ethereumAddressSchema,
	ethTransactionParamsSchema,
	ethValueSchema,
	hexDataSchema,
	nonceSchema,
	numericStringSchema,
	positiveAmountSchema,
	safeIdSchema,
} from "./validators";

describe("validators", () => {
	it("validates ethereum addresses", () => {
		expect(() =>
			ethereumAddressSchema.parse("0x0000000000000000000000000000000000000000"),
		).not.toThrow();
		expect(() =>
			ethereumAddressSchema.parse("0xZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZZ"),
		).toThrow();
		expect(() => ethereumAddressSchema.parse("0x123")).toThrow();
	});

	it("validates checksummed addresses", () => {
		expect(() =>
			checkedAddressSchema.parse("0x0000000000000000000000000000000000000000"),
		).not.toThrow();
		expect(() =>
			checkedAddressSchema.parse("0x0000000000000000000000000000000000000001"),
		).not.toThrow();
		expect(() =>
			checkedAddressSchema.parse("0x000000000000000000000000000000000000000g"),
		).toThrow();
		expect(() =>
			checkedAddressSchema.parse("0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"),
		).toThrow();
		expect(() =>
			checkedAddressSchema.parse("0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE"),
		).not.toThrow();
	});

	it("validates chainId", () => {
		expect(() => chainIdSchema.parse("1")).not.toThrow();
		expect(() => chainIdSchema.parse("0")).toThrow();
		expect(() => chainIdSchema.parse("-1")).toThrow();
	});

	it("validates numeric strings", () => {
		expect(() => numericStringSchema.parse("123456")).not.toThrow();
		expect(() => numericStringSchema.parse("abc")).toThrow();
		expect(() => numericStringSchema.parse("12.3")).toThrow();
	});

	it("validates safeId object", () => {
		expect(() =>
			safeIdSchema.parse({
				safe: "0x0000000000000000000000000000000000000000",
				chainId: "1",
			}),
		).not.toThrow();
		expect(() => safeIdSchema.parse({ safe: "0x123", chainId: "1" })).toThrow();
		expect(() =>
			safeIdSchema.parse({
				safe: "0x0000000000000000000000000000000000000000",
				chainId: "0",
			}),
		).toThrow();
	});

	it("validates nonceSchema", () => {
		const schema = nonceSchema("5");
		expect(() => schema.parse("5")).not.toThrow();
		expect(() => schema.parse("6")).not.toThrow();
		expect(() => schema.parse(7n)).not.toThrow();
		expect(() => schema.parse(4n)).toThrow();
		expect(() => schema.parse("4")).toThrow();
		expect(() => schema.parse(0n)).toThrow();
		expect(() => schema.parse("")).not.toThrow();
	});

	it("validates positiveAmountSchema", () => {
		expect(() => positiveAmountSchema.parse("1.5")).not.toThrow();
		expect(() => positiveAmountSchema.parse("0.1")).not.toThrow();
		expect(() => positiveAmountSchema.parse("0")).toThrow();
		expect(() => positiveAmountSchema.parse("-1")).toThrow();
		expect(() => positiveAmountSchema.parse("")).toThrow();
	});

	it("validates ethValueSchema", () => {
		expect(() => ethValueSchema.parse("0")).not.toThrow();
		expect(() => ethValueSchema.parse("1.5")).not.toThrow();
		expect(() => ethValueSchema.parse("-1")).toThrow();
		expect(() => ethValueSchema.parse("abc")).toThrow();
	});

	it("validates hexDataSchema", () => {
		expect(() => hexDataSchema.parse("0x123abc")).not.toThrow();
		expect(() => hexDataSchema.parse("")).not.toThrow();
		expect(() => hexDataSchema.parse("123abc")).toThrow();
		expect(() => hexDataSchema.parse("0xZZZ")).toThrow();
	});

	it("validates ethTransactionParamsSchema", () => {
		expect(() =>
			ethTransactionParamsSchema.parse({
				to: "0x0000000000000000000000000000000000000000",
				value: "1",
				data: "0x123",
				from: "0x0000000000000000000000000000000000000001",
				gas: "21000",
			}),
		).not.toThrow();
		expect(() =>
			ethTransactionParamsSchema.parse({
				to: "0x123",
				value: "1",
			}),
		).toThrow();
	});
});
