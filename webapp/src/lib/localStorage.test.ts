import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import {
	addERC20TokenAddress,
	ERC20_TOKEN_ADDRESSES_BY_CHAIN_KEY,
	getERC20TokenAddresses,
	removeERC20TokenAddress,
} from "./localStorage";

// Mock localStorage
const localStorageMock = (() => {
	let store: Record<string, string> = {};
	return {
		getItem: (key: string) => store[key] || null,
		setItem: (key: string, value: string) => {
			store[key] = value.toString();
		},
		removeItem: (key: string) => {
			delete store[key];
		},
		clear: () => {
			store = {};
		},
	};
})();

Object.defineProperty(window, "localStorage", {
	value: localStorageMock,
});

describe("localStorage ERC20 Token Management", () => {
	let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		localStorageMock.clear();
		// Spy on console.error before each test
		consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterEach(() => {
		// Restore console.error spy after each test
		consoleErrorSpy.mockRestore();
	});

	it("should return an empty array when local storage is empty", () => {
		expect(getERC20TokenAddresses(1)).toEqual([]);
	});

	it("should add a new valid address correctly", () => {
		const chainId = 1;
		const newAddress = "0x1234567890123456789012345678901234567890";
		addERC20TokenAddress(newAddress, chainId);
		expect(getERC20TokenAddresses(chainId)).toEqual([newAddress]);
		const rawStoredValue = localStorageMock.getItem(
			ERC20_TOKEN_ADDRESSES_BY_CHAIN_KEY,
		);
		expect(rawStoredValue).toBe(JSON.stringify({ [chainId]: [newAddress] }));
	});

	it("should retrieve all added addresses", () => {
		const chainId = 1;
		const address1 = "0x1234567890123456789012345678901234567890";
		const address2 = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
		addERC20TokenAddress(address1, chainId);
		addERC20TokenAddress(address2, chainId);
		expect(getERC20TokenAddresses(chainId)).toEqual([address1, address2]);
	});

	it("should not add a duplicate address", () => {
		const address = "0x1234567890123456789012345678901234567890";
		const chainId = 1;

		addERC20TokenAddress(address, chainId);
		addERC20TokenAddress(address, chainId); // Try adding again
		expect(getERC20TokenAddresses(chainId)).toEqual([address]);
		expect(getERC20TokenAddresses(chainId).length).toBe(1);
	});

	it("should not add an invalid address and should log an error", () => {
		const invalidAddress = "invalid-address";
		addERC20TokenAddress(invalidAddress, 1);
		expect(getERC20TokenAddresses(1)).toEqual([]);
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			"Error parsing ERC20 token addresses from local storage:",
			expect.any(ZodError),
		);
	});

	it("should remove an existing address", () => {
		const address1 = "0x1234567890123456789012345678901234567890";
		const address2 = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
		addERC20TokenAddress(address1, 1);
		addERC20TokenAddress(address2, 1);
		removeERC20TokenAddress(address1, 1);
		expect(getERC20TokenAddresses(1)).toEqual([address2]);
	});

	it("should do nothing when trying to remove a non-existent address", () => {
		const address1 = "0x1234567890123456789012345678901234567890";
		const nonExistentAddress = "0x0000000000000000000000000000000000000000";
		addERC20TokenAddress(address1, 1);
		removeERC20TokenAddress(nonExistentAddress, 1);
		expect(getERC20TokenAddresses(1)).toEqual([address1]);
	});

	it("should return an empty array and log an error when local storage contains invalid JSON", () => {
		localStorageMock.setItem(
			ERC20_TOKEN_ADDRESSES_BY_CHAIN_KEY,
			"this is not json",
		);
		expect(getERC20TokenAddresses(1)).toEqual([]);
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			"Error parsing ERC20 token addresses from local storage:",
			expect.any(SyntaxError),
		);
	});

	it("should return an empty array when local storage contains a non-array (but valid JSON)", () => {
		localStorageMock.setItem(
			ERC20_TOKEN_ADDRESSES_BY_CHAIN_KEY,
			JSON.stringify({ not: "an array" }),
		);
		expect(getERC20TokenAddresses(1)).toEqual([]);
		// No console error is expected here by the current implementation, as it's a valid JSON but not the expected type.
		// The function handles this by returning [], but doesn't log an error for it.
		// If specific error logging for this case is desired, the main function should be updated.
	});

	it("should return an empty array when local storage contains an array with non-string elements", () => {
		localStorageMock.setItem(
			ERC20_TOKEN_ADDRESSES_BY_CHAIN_KEY,
			JSON.stringify(["0x123", 12345]),
		);
		expect(getERC20TokenAddresses(1)).toEqual([]);
		// No console error is expected here by the current implementation
	});
});
