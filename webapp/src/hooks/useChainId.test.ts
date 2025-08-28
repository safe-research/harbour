import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { JsonRpcApiProvider } from "ethers";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { createQueryClientWrapper } from "./test-utils";
import { useChainId } from "./useChainId";

describe("useChainId", () => {
	it("returns chainId from provider", async () => {
		const network = { chainId: 123n, name: "testnet" };
		const mockProvider = {
			getNetwork: vi.fn().mockResolvedValue(network),
		} as unknown as JsonRpcApiProvider;

		const wrapper = createQueryClientWrapper();

		const { result } = renderHook(() => useChainId(mockProvider), { wrapper });

		await waitFor(() => expect(result.current.isSuccess).toBe(true));
		expect(result.current.data).toBe(123n);
	});

	it("is disabled when provider is null", () => {
		const queryClient = new QueryClient();
		const wrapper = ({ children }: { children: React.ReactNode }) =>
			React.createElement(
				QueryClientProvider,
				{ client: queryClient },
				children,
			);

		const { result } = renderHook(() => useChainId(null), { wrapper });

		expect(result.current.isLoading).toBe(false);
		expect(result.current.data).toBeUndefined();
	});
});
