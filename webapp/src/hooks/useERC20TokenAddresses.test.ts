import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { addERC20TokenAddress } from "@/lib/localStorage";
import localStorageMock from "@/lib/test-utils";

Object.defineProperty(window, "localStorage", {
	value: localStorageMock,
});

import { useERC20TokenAddresses } from "./useERC20TokenAddresses";

describe("useERC20TokenAddresses", () => {
	beforeEach(() => {
		localStorageMock.clear();
	});

	it("returns initial addresses from localStorage", () => {
		addERC20TokenAddress("0x0000000000000000000000000000000000000001", 123n);
		const { result } = renderHook(() => useERC20TokenAddresses(123n));
		expect(result.current.addresses).toEqual([
			"0x0000000000000000000000000000000000000001",
		]);
	});

	it("adds an address and updates state", () => {
		addERC20TokenAddress("0x0000000000000000000000000000000000000001", 123n);

		const { result } = renderHook(() => useERC20TokenAddresses(123n));
		act(() => {
			result.current.addAddress("0x0000000000000000000000000000000000000002");
		});

		expect(result.current.addresses).toEqual([
			"0x0000000000000000000000000000000000000001",
			"0x0000000000000000000000000000000000000002",
		]);
	});

	it("removes an address and updates state", () => {
		addERC20TokenAddress("0x0000000000000000000000000000000000000001", 123n);
		const { result } = renderHook(() => useERC20TokenAddresses(123n));
		act(() => {
			result.current.removeAddress(
				"0x0000000000000000000000000000000000000001",
			);
		});

		expect(result.current.addresses).toEqual([]);
	});

	it("refreshes addresses when called", () => {
		addERC20TokenAddress("0x0000000000000000000000000000000000000001", 123n);
		addERC20TokenAddress("0x0000000000000000000000000000000000000003", 123n);
		const { result } = renderHook(() => useERC20TokenAddresses(123n));
		act(() => {
			result.current.refreshAddresses();
		});
		expect(result.current.addresses).toEqual([
			"0x0000000000000000000000000000000000000001",
			"0x0000000000000000000000000000000000000003",
		]);
	});
});
