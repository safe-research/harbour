import { renderHook } from "@testing-library/react";
import { BrowserProvider, type Eip1193Provider } from "ethers";
import { describe, expect, it, vi } from "vitest";
import { useBrowserProvider } from "./useBrowserProvider";

vi.mock("@web3-onboard/react", () => ({
	useConnectWallet: vi.fn(),
}));

import * as onboard from "@web3-onboard/react";

// Minimal types the hook actually needs.
// This is to precent the use of any type which the linter doesn't like.
type UseConnectWalletLike = () => readonly [
	{ wallet: { provider: Eip1193Provider } | null },
];

// Narrow the imported hook once so we can mock it ergonomically
const useConnectWalletTyped =
	onboard.useConnectWallet as unknown as UseConnectWalletLike;

describe("useBrowserProvider", () => {
	it("returns undefined when wallet is not connected", () => {
		const mockReturn = [
			{ wallet: null },
		] as const satisfies ReturnType<UseConnectWalletLike>;
		vi.mocked(useConnectWalletTyped).mockReturnValue(mockReturn);

		const { result } = renderHook(() => useBrowserProvider());

		expect(result.current).toBeUndefined();
	});

	it("returns BrowserProvider when wallet is connected", () => {
		const mockProvider: Eip1193Provider = {
			request: vi.fn(async () => null),
			on: vi.fn(),
			removeListener: vi.fn(),
		};

		const connected = [
			{ wallet: { provider: mockProvider } },
		] as const satisfies ReturnType<UseConnectWalletLike>;
		vi.mocked(useConnectWalletTyped).mockReturnValue(connected);

		const { result } = renderHook(() => useBrowserProvider());
		expect(result.current).toBeInstanceOf(BrowserProvider);
	});
});
