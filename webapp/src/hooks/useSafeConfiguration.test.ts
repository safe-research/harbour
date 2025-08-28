import { renderHook, waitFor } from "@testing-library/react";
import type { JsonRpcApiProvider } from "ethers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClientWrapper } from "./test-utils";

describe("useSafeConfiguration", () => {
	const safeAddress = "0xSafe";
	const chainId = 123n;
	const provider = {} as unknown as JsonRpcApiProvider;

	beforeEach(() => {
		vi.resetModules();
	});

	it("returns safe configuration when query succeeds", async () => {
		vi.doMock("./useChainId", () => ({
			useChainId: vi.fn().mockReturnValue({ data: chainId }),
		}));
		vi.doMock("@/lib/safe", () => ({
			getSafeConfiguration: vi
				.fn()
				.mockResolvedValue({ name: "TestSafe", owners: ["0xOwner"] }),
		}));
		const { useSafeConfiguration } = await import("./useSafeConfiguration");
		const { result } = renderHook(
			() => useSafeConfiguration(provider, safeAddress),
			{
				wrapper: createQueryClientWrapper(),
			},
		);
		await waitFor(() => {
			expect(result.current.data).toEqual({
				name: "TestSafe",
				owners: ["0xOwner"],
			});
			expect(result.current.error).toBeNull();
		});
	});

	it("returns error if getSafeConfiguration fails", async () => {
		vi.doMock("./useChainId", () => ({
			useChainId: vi.fn().mockReturnValue({ data: chainId }),
		}));
		vi.doMock("@/lib/safe", () => ({
			getSafeConfiguration: vi.fn().mockRejectedValue(new Error("fail")),
		}));
		const { useSafeConfiguration } = await import("./useSafeConfiguration");
		const { result } = renderHook(
			() => useSafeConfiguration(provider, safeAddress),
			{
				wrapper: createQueryClientWrapper(),
			},
		);
		await waitFor(() => {
			expect(result.current.error?.message).toBe("fail");
			expect(result.current.data).toBeUndefined();
		});
	});

	it("does not run query if provider is null", async () => {
		vi.doMock("./useChainId", () => ({
			useChainId: vi.fn().mockReturnValue({ data: chainId }),
		}));
		vi.doMock("@/lib/safe", () => ({
			getSafeConfiguration: vi.fn(),
		}));
		const { useSafeConfiguration } = await import("./useSafeConfiguration");
		const { result } = renderHook(
			() => useSafeConfiguration(null, safeAddress),
			{
				wrapper: createQueryClientWrapper(),
			},
		);
		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
			expect(result.current.data).toBeUndefined();
		});
	});
});
