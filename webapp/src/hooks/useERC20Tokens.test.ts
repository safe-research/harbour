import { renderHook, waitFor } from "@testing-library/react";
import type { JsonRpcApiProvider } from "ethers";
import { describe, expect, it, vi } from "vitest";

vi.mock("./useERC20TokenAddresses", () => {
	const mockUseERC20TokenAddresses = vi.fn().mockReturnValue({
		addresses: ["0xToken1", "0xToken2"],
		addAddress: vi.fn(),
		removeAddress: vi.fn(),
	});
	return {
		useERC20TokenAddresses: mockUseERC20TokenAddresses,
	};
});

vi.mock("@/lib/erc20", () => {
	const mockFetchBatchERC20TokenDetails = vi.fn().mockResolvedValue([
		{ symbol: "TKN1", decimals: 18, address: "0xToken1" },
		{ symbol: "TKN2", decimals: 18, address: "0xToken2" },
	]);
	return {
		fetchBatchERC20TokenDetails: mockFetchBatchERC20TokenDetails,
		mockFetchBatchERC20TokenDetails,
	};
});

import { createQueryClientWrapper } from "./test-utils";
import { useERC20Tokens } from "./useERC20Tokens";

describe("useERC20Tokens", () => {
	const safeAddress = "0xSafe";
	const chainId = 123n;

	it("returns tokens and helpers when query succeeds", async () => {
		const provider = {} as unknown as JsonRpcApiProvider;

		const wrapper = createQueryClientWrapper();

		const { result } = renderHook(
			() => useERC20Tokens(provider, safeAddress, chainId),
			{ wrapper },
		);
		await waitFor(() => {
			expect(result.current.tokens).toHaveLength(2);
		});
		expect(result.current.tokens).toHaveLength(2);
		expect(result.current.tokens[0].symbol).toBe("TKN1");
		expect(result.current.refresh).toBeDefined();
		expect(result.current.error).toBeNull();
	});
});
