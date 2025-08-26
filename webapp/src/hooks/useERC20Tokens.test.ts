import { renderHook, waitFor } from "@testing-library/react";
import type { JsonRpcApiProvider } from "ethers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryClientWrapper } from "./test-utils";

describe("useERC20Tokens", () => {
	const safeAddress = "0xSafe";
	const chainId = 123n;

	beforeEach(() => {
		vi.resetModules();
	});

	it("returns tokens and helpers when query succeeds", async () => {
		vi.doMock("./useERC20TokenAddresses", () => ({
			useERC20TokenAddresses: vi.fn().mockReturnValue({
				addresses: ["0xToken1", "0xToken2"],
				addAddress: vi.fn(),
				removeAddress: vi.fn(),
			}),
		}));
		vi.doMock("@/lib/erc20", () => ({
			fetchBatchERC20TokenDetails: vi.fn().mockResolvedValue([
				{ symbol: "TKN1", decimals: 18, address: "0xToken1" },
				{ symbol: "TKN2", decimals: 18, address: "0xToken2" },
			]),
		}));
		const { useERC20Tokens } = await import("./useERC20Tokens");
		const provider = {} as unknown as JsonRpcApiProvider;

		const { result } = renderHook(
			() => useERC20Tokens(provider, safeAddress, chainId),
			{ wrapper: createQueryClientWrapper() },
		);
		await waitFor(() => {
			expect(result.current.tokens).toHaveLength(2);
			expect(result.current.tokens[0].symbol).toBe("TKN1");
			expect(result.current.refresh).toBeDefined();
			expect(result.current.error).toBeNull();
		});
	});

	it("returns empty tokens if addresses is empty", async () => {
		vi.doMock("./useERC20TokenAddresses", () => ({
			useERC20TokenAddresses: vi.fn().mockReturnValue({
				addresses: [],
				addAddress: vi.fn(),
				removeAddress: vi.fn(),
			}),
		}));
		vi.doMock("@/lib/erc20", () => ({
			fetchBatchERC20TokenDetails: vi.fn().mockResolvedValue([]),
		}));
		const { useERC20Tokens } = await import("./useERC20Tokens");
		const provider = {} as unknown as JsonRpcApiProvider;

		const { result } = renderHook(
			() => useERC20Tokens(provider, safeAddress, chainId),
			{ wrapper: createQueryClientWrapper() },
		);
		await waitFor(() => {
			expect(result.current.tokens).toEqual([]);
		});
	});
});
