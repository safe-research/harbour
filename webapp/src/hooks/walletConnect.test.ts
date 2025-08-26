import { renderHook } from "@testing-library/react";
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { WalletConnectContext } from "../providers/WalletConnectProvider";
import { useRegisterSafeContext, useWalletConnect } from "./walletConnect";

const mockSetSafeContext = vi.fn();
const mockContextValue = {
	setSafeContext: mockSetSafeContext,
};

describe("useWalletConnect", () => {
	it("returns context when inside provider", () => {
		const wrapper = ({ children }: { children: React.ReactNode }) =>
			React.createElement(
				WalletConnectContext.Provider,
				{ value: mockContextValue },
				children,
			);

		const { result } = renderHook(() => useWalletConnect(), { wrapper });
		expect(result.current).toBe(mockContextValue);
	});

	it("throws error when outside provider", () => {
		let thrownError: unknown;
		try {
			renderHook(() => useWalletConnect());
		} catch (err) {
			thrownError = err;
		}
		expect(thrownError).toBeInstanceOf(Error);
		expect((thrownError as Error).message).toMatch(
			/useWalletConnect must be used within <WalletConnectProvider>/,
		);
	});
});

describe("useRegisterSafeContext", () => {
	it("calls setSafeContext on context change", () => {
		const wrapper = ({ children }: { children: React.ReactNode }) =>
			React.createElement(
				WalletConnectContext.Provider,
				{ value: mockContextValue },
				children,
			);
		const safe = "0x123";
		const chainId = 1n;
		renderHook(() => useRegisterSafeContext(safe, chainId), { wrapper });
		expect(mockSetSafeContext).toHaveBeenCalledWith({ safe, chainId });
	});
});
