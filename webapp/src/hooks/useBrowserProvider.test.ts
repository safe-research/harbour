import { renderHook } from "@testing-library/react";
import { BrowserProvider } from "ethers";
import { describe, expect, it, vi } from "vitest";
import { useBrowserProvider } from "./useBrowserProvider";

vi.mock("@web3-onboard/react", () => ({
	useConnectWallet: vi.fn(),
}));

import * as onboard from "@web3-onboard/react";

describe("useBrowserProvider", () => {
	it("returns undefined when wallet is not connected", () => {
		const mockConnectWallet = [{ wallet: null }] as any;
		vi.mocked(onboard.useConnectWallet).mockReturnValue(mockConnectWallet);

		const { result } = renderHook(() => useBrowserProvider());

		expect(result.current).toBeUndefined();
	});

	it("returns BrowserProvider when wallet is connected", () => {
		const mockProvider = {
			on: vi.fn(),
			request: vi.fn(),
			removeListener: vi.fn(),
		} as any;
		const mockWallet = { provider: mockProvider } as any;
		const mockConnectWallet = [{ wallet: mockWallet }] as any;
		vi.mocked(onboard.useConnectWallet).mockReturnValue(
			mockConnectWallet as any,
		);

		const { result } = renderHook(() => useBrowserProvider());

		expect(result.current).toBeInstanceOf(BrowserProvider);
		expect(result.current?.provider).toBeDefined();
	});
});
