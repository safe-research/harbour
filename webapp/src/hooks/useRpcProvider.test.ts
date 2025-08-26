import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

describe("useChainlistRpcProvider", () => {
	it("returns provider when RPC URL resolves", async () => {
		vi.doMock("../lib/chains", () => ({
			getRpcUrlByChainId: vi.fn().mockResolvedValue("https://rpc.example"),
		}));
		const { useChainlistRpcProvider, DEFAULT_PROVIDER_OPTIONS } = await import(
			"./useRpcProvider"
		);
		const { result } = renderHook(() =>
			useChainlistRpcProvider(1n, DEFAULT_PROVIDER_OPTIONS),
		);
		await waitFor(() => {
			expect(result.current.provider).not.toBeNull();
			expect(result.current.error).toBeNull();
			expect(result.current.isLoading).toBe(false);
		});
	});
});

describe("useHarbourRpcProvider", () => {
	it("returns provider when loadCurrentSettings returns rpcUrl", async () => {
		vi.mock("@/components/settings/SettingsForm", () => ({
			loadCurrentSettings: vi
				.fn()
				.mockResolvedValue({ rpcUrl: "https://rpc.harbour" }),
		}));
		vi.doMock("../lib/chains", () => ({ getRpcUrlByChainId: vi.fn() }));
		const { useHarbourRpcProvider, DEFAULT_PROVIDER_OPTIONS } = await import(
			"./useRpcProvider"
		);
		const { result } = renderHook(() =>
			useHarbourRpcProvider(DEFAULT_PROVIDER_OPTIONS),
		);
		await waitFor(() => {
			expect(result.current.provider).not.toBeNull();
			expect(result.current.error).toBeNull();
			expect(result.current.isLoading).toBe(false);
		});
	});

	it("returns provider when loadCurrentSettings returns no rpcUrl", async () => {
		vi.mock("@/components/settings/SettingsForm", () => ({
			loadCurrentSettings: vi.fn().mockResolvedValue({}),
		}));
		vi.doMock("../lib/chains", () => ({
			getRpcUrlByChainId: vi.fn().mockResolvedValue("https://rpc.fallback"),
		}));
		const { useHarbourRpcProvider, DEFAULT_PROVIDER_OPTIONS } = await import(
			"./useRpcProvider"
		);
		const { result } = renderHook(() =>
			useHarbourRpcProvider(DEFAULT_PROVIDER_OPTIONS),
		);
		await waitFor(() => {
			expect(result.current.provider).not.toBeNull();
			expect(result.current.error).toBeNull();
			expect(result.current.isLoading).toBe(false);
		});
	});
});
