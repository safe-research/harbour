import { renderHook, waitFor } from "@testing-library/react";
import type { JsonRpcApiProvider } from "ethers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SafeConfiguration } from "@/lib/safe";
import type { ChainId } from "@/lib/types";
import { createQueryClientWrapper } from "./test-utils";

describe("useSafeQueue", () => {
	const provider = {} as JsonRpcApiProvider;
	const safeAddress = "0xSafe";
	const safeConfig: Pick<SafeConfiguration, "nonce" | "owners"> = {
		nonce: "1",
		owners: ["0xOwner"],
	};
	const safeChainId: ChainId = 123n;

	beforeEach(() => {
		vi.resetModules();
	});

	it("returns queue data when query succeeds", async () => {
		vi.doMock("@/lib/harbour", () => ({
			fetchSafeQueue: vi
				.fn()
				.mockResolvedValue([{ nonce: 1n, transactions: [] }]),
		}));
		const { useSafeQueue } = await import("./useSafeQueue");
		const { result } = renderHook(
			() => useSafeQueue({ provider, safeAddress, safeConfig, safeChainId }),
			{ wrapper: createQueryClientWrapper() },
		);
		await waitFor(() => {
			expect(result.current.data).toEqual([{ nonce: 1n, transactions: [] }]);
			expect(result.current.error).toBeNull();
		});
	});

	it("does not run query if owners is empty", async () => {
		vi.doMock("@/lib/harbour", () => ({
			fetchSafeQueue: vi.fn(),
		}));
		const { useSafeQueue } = await import("./useSafeQueue");
		const { result } = renderHook(
			() =>
				useSafeQueue({
					provider,
					safeAddress,
					safeConfig: { nonce: "1", owners: [] },
					safeChainId,
				}),
			{ wrapper: createQueryClientWrapper() },
		);
		await waitFor(() => {
			expect(result.current.isLoading).toBe(false);
			expect(result.current.data).toBeUndefined();
		});
	});
});
