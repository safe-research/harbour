import type { AnyRouter } from "@tanstack/react-router";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WalletKitInstance } from "@/lib/walletconnect";

const router = { navigate: vi.fn() } as unknown as AnyRouter;
const safeIdRef = { current: { safe: "0xSafe", chainId: 1n } };

const mockWalletKit = (): WalletKitInstance =>
	({
		getActiveSessions: vi.fn().mockReturnValue({}),
		on: vi.fn(),
		off: vi.fn(),
		approveSession: vi.fn().mockResolvedValue(undefined),
		rejectSession: vi.fn().mockResolvedValue(undefined),
		respondSessionRequest: vi.fn().mockResolvedValue(undefined),
	}) as unknown as WalletKitInstance;

describe("useWalletConnectSession", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it("syncs sessions on mount", async () => {
		const walletkit = mockWalletKit();
		const { useWalletConnectSession } = await import(
			"./useWalletConnectSession"
		);
		const { result } = renderHook(() =>
			useWalletConnectSession({ walletkit, router, safeIdRef }),
		);
		expect(walletkit.getActiveSessions).toHaveBeenCalled();
		expect(typeof result.current.sessions).toBe("object");
		expect(result.current.error).toBeNull();
	});

	it("syncs sessions on delete", async () => {
		const walletkit = mockWalletKit();
		const { useWalletConnectSession } = await import(
			"./useWalletConnectSession"
		);
		const { result } = renderHook(() =>
			useWalletConnectSession({ walletkit, router, safeIdRef }),
		);
		await act(async () => {
			result.current.syncSessions(walletkit);
		});
		expect(walletkit.getActiveSessions).toHaveBeenCalled();
	});
});
