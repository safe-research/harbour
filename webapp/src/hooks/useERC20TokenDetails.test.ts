import { renderHook, waitFor } from "@testing-library/react";
import type { JsonRpcApiProvider } from "ethers";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/erc20", () => {
	const mockFetchERC20TokenDetails = vi.fn().mockResolvedValue({
		symbol: "TKN",
		decimals: 18,
		address: "0xToken",
		balance: 1000n,
	});
	return {
		fetchERC20TokenDetails: mockFetchERC20TokenDetails,
	};
});

import { createQueryClientWrapper } from "./test-utils";
import { useERC20TokenDetails } from "./useERC20TokenDetails";

describe("useERC20TokenDetails", () => {
	const provider = {} as unknown as JsonRpcApiProvider;
	const tokenAddress = "0xToken";
	const ownerAddress = "0xOwner";
	const chainId = 1n;

	it("returns token details when query succeeds", async () => {
		const wrapper = createQueryClientWrapper();

		const { result } = renderHook(
			() => useERC20TokenDetails(provider, tokenAddress, ownerAddress, chainId),
			{ wrapper },
		);
		await waitFor(() => {
			expect(result.current.data).toBeTruthy();
			expect(result.current.data?.symbol).toBe("TKN");
			expect(result.current.data?.balance).toBe(1000n);
			expect(result.current.isLoading).toBe(false);
			expect(result.current.error).toBeNull();
		});
	});

	it("does not run query if required params are missing", async () => {
		const wrapper = createQueryClientWrapper();

		const { result } = renderHook(
			() => useERC20TokenDetails(provider, "", ownerAddress, chainId),
			{ wrapper },
		);
		expect(result.current.isLoading).toBe(false);
		expect(result.current.data).toBeUndefined();
	});
});
