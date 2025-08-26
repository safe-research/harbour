import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { BrowserProvider } from "ethers";
// import { useBrowserProvider } from "./useBrowserProvider";

type Eip1193 = {
  request: (args: { method: string; params?: unknown[] | object }) => Promise<unknown>;
};
type MockWallet = { provider: Eip1193 } | null;

let currentWallet: MockWallet = null;
const useConnectWalletMock = vi.fn(() => [{ wallet: currentWallet }]);

vi.mock("@web3-onboard/react", () => ({
  useConnectWallet: useConnectWalletMock,
}));

// ---- import the hook under test ----
import { useBrowserProvider } from "./useBrowserProvider";

function makeProvider(): Eip1193 {
  return { request: async () => null };
}

describe("useBrowserProvider", () => {
  beforeEach(() => {
    currentWallet = null;
    useConnectWalletMock.mockClear();
  });

  it("returns undefined when no wallet is connected", () => {
    currentWallet = null;

    const { result } = renderHook(() => useBrowserProvider());
    expect(result.current).toBeUndefined();
  });

  it("returns an ethers BrowserProvider when a wallet exists", () => {
    const provider = makeProvider();
    currentWallet = { provider };

    const { result } = renderHook(() => useBrowserProvider());
    expect(result.current).toBeInstanceOf(BrowserProvider);
  });


// vi.mock("@web3-onboard/react", () => ({
// 	useConnectWallet: vi.fn(),
// }));

// import * as onboard from "@web3-onboard/react";

// describe("useBrowserProvider", () => {
// 	it("returns undefined when wallet is not connected", () => {
// 		// const mockConnectWallet = [{ wallet: null }] as any;
// 		const mockConnectWallet = [{ wallet: null }] as ;
// 		vi.mocked(onboard.useConnectWallet).mockReturnValue(mockConnectWallet);

// 		const { result } = renderHook(() => useBrowserProvider());

// 		expect(result.current).toBeUndefined();
// 	});

// 	it("returns BrowserProvider when wallet is connected", () => {
// 		const mockProvider = {
// 			on: vi.fn(),
// 			request: vi.fn(),
// 			removeListener: vi.fn(),
// 		} as unknown as JsonRpcApiProvider;
// 		const mockWallet = { provider: mockProvider } as unknown;
// 		const mockConnectWallet = [{ wallet: mockWallet }] as unknown;
// 		vi.mocked(onboard.useConnectWallet).mockReturnValue(
// 			mockConnectWallet as any,
// 		);

// 		const { result } = renderHook(() => useBrowserProvider());

// 		expect(result.current).toBeInstanceOf(BrowserProvider);
// 		expect(result.current?.provider).toBeDefined();
// 	});
});
