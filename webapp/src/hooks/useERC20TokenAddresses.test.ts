import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/localStorage", () => ({
	getERC20TokenAddresses: vi.fn().mockReturnValue(["0xToken1"]),
	addERC20TokenAddress: vi.fn(),
	removeERC20TokenAddress: vi.fn(),
}));

import { useERC20TokenAddresses } from "./useERC20TokenAddresses";

describe("useERC20TokenAddresses", () => {
	const chainId = 1n;

	it("returns initial addresses from localStorage", () => {
		const { result } = renderHook(() => useERC20TokenAddresses(chainId));
		expect(result.current.addresses).toEqual(["0xToken1"]);
	});
});
