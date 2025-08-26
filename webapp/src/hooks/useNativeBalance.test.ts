import { renderHook, waitFor } from "@testing-library/react";
import type { JsonRpcApiProvider } from "ethers";
import { describe, expect, it, vi } from "vitest";
import { createQueryClientWrapper } from "./test-utils";
import { useNativeBalance } from "./useNativeBalance";

describe("useNativeBalance", () => {
	const safeAddress = "0xSafe";
	const chainId = 123n;

	it("returns native balance when query succeeds", async () => {
		const mockGetBalance = vi.fn().mockResolvedValue(789n);
		const provider = {
			getBalance: mockGetBalance,
		} as unknown as JsonRpcApiProvider;

		const { result } = renderHook(
			() => useNativeBalance(provider, safeAddress, chainId),
			{ wrapper: createQueryClientWrapper() },
		);
		await waitFor(() => {
			expect(result.current.data).toBe(789n);
			expect(result.current.isLoading).toBe(false);
			expect(result.current.error).toBeNull();
		});
		expect(mockGetBalance).toHaveBeenCalledWith(safeAddress);
	});

	it("returns null if getBalance fails", async () => {
		const mockGetBalance = vi.fn().mockRejectedValue(new Error("fail"));
		const provider = {
			getBalance: mockGetBalance,
		} as unknown as JsonRpcApiProvider;

		const { result } = renderHook(
			() => useNativeBalance(provider, safeAddress, chainId),
			{ wrapper: createQueryClientWrapper() },
		);
		await waitFor(() => {
			expect(result.current.error).toBeNull();
		});
	});

	it("does not run query if provider or safeAddress is missing", async () => {
		const provider = undefined as unknown as JsonRpcApiProvider;
		const safeAddress = "";
		const chainId = 1n;
		const { result } = renderHook(
			() => useNativeBalance(provider, safeAddress, chainId),
			{ wrapper: createQueryClientWrapper() },
		);
		expect(result.current.isLoading).toBe(false);
		expect(result.current.data).toBeUndefined();
	});
});
