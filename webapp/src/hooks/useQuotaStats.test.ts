import { renderHook, waitFor } from "@testing-library/react";
import type { JsonRpcApiProvider } from "ethers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClientWrapper } from "./test-utils";

describe("useQuotaStats", () => {
	const provider = {} as JsonRpcApiProvider;
	const signerAddress = "0xSigner";
	const quotaManagerAddress = "0xQuotaManager";

	beforeEach(() => {
		vi.resetModules();
	});

	it("returns quota stats when query succeeds", async () => {
		vi.doMock("@/lib/quotaManager", () => ({
			quotaManagerAt: vi.fn().mockReturnValue({
				availableFreeQuotaForSigner: vi.fn().mockResolvedValue({
					availableFreeQuota: 10,
					usedSignerQuota: 5,
					nextSignerQuotaReset: 12345,
				}),
			}),
		}));
		const { useQuotaStats } = await import("./useQuotaStats");
		const { result } = renderHook(
			() => useQuotaStats(provider, signerAddress, quotaManagerAddress),
			{ wrapper: createQueryClientWrapper() },
		);
		await waitFor(() => {
			expect(result.current.quotaStats).toEqual({
				availableFreeQuota: 10,
				usedSignerQuota: 5,
				nextSignerQuotaReset: 12345,
			});
			expect(result.current.error).toBeNull();
		});
	});

	it("returns empty stats if not initialized", async () => {
		vi.doMock("@/lib/quotaManager", () => ({
			quotaManagerAt: vi.fn(),
		}));
		const { useQuotaStats } = await import("./useQuotaStats");
		const { result } = renderHook(() => useQuotaStats(null, null, undefined), {
			wrapper: createQueryClientWrapper(),
		});
		await waitFor(() => {
			expect(result.current.quotaStats).toEqual({
				availableFreeQuota: 0,
				usedSignerQuota: 0,
				nextSignerQuotaReset: 0,
			});
		});
	});
});

describe("useQuotaTokenStats", () => {
	const provider = {} as JsonRpcApiProvider;
	const signerAddress = "0xSigner";
	const quotaManagerAddress = "0xQuotaManager";

	beforeEach(() => {
		vi.resetModules();
	});

	it("returns token stats when query succeeds", async () => {
		vi.doMock("@/lib/quotaManager", () => ({
			quotaManagerAt: vi.fn().mockReturnValue({
				FEE_TOKEN: vi.fn().mockResolvedValue("0xToken"),
				quotaStatsForSigner: vi
					.fn()
					.mockResolvedValue({ tokenBalance: "1000" }),
			}),
		}));
		vi.doMock("@/lib/erc20", () => ({
			fetchERC20TokenDetails: vi
				.fn()
				.mockResolvedValue({ address: "0xToken", symbol: "TKN" }),
		}));
		const { useQuotaTokenStats } = await import("./useQuotaStats");
		const { result } = renderHook(
			() => useQuotaTokenStats(provider, signerAddress, quotaManagerAddress),
			{ wrapper: createQueryClientWrapper() },
		);
		await waitFor(() => {
			expect(result.current.quotaTokenStats).toEqual({
				tokenInfo: { address: "0xToken", symbol: "TKN" },
				lockedTokens: BigInt("1000"),
			});
			expect(result.current.error).toBeNull();
		});
	});
});
