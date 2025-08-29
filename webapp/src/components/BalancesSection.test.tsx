import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import type { JsonRpcApiProvider } from "ethers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BalancesSection } from "./BalancesSection";

// Mocks for hooks and dependencies
vi.mock("@/hooks/useNativeBalance", () => ({
	useNativeBalance: () => ({
		data: 1000000000000000000n,
		isLoading: false,
		error: null,
	}),
}));
vi.mock("@/hooks/useERC20Tokens", () => ({
	useERC20Tokens: () => ({
		tokens: [
			{
				address: "0x1",
				name: "TokenA",
				symbol: "TKA",
				decimals: 18,
				balance: 1000000000000000000n,
			},
		],
		isLoading: false,
		error: null,
		addAddress: vi.fn(),
		removeAddress: vi.fn(),
	}),
}));
vi.mock("@/lib/chains", () => ({
	getNativeCurrencyByChainId: () => ({
		name: "Ether",
		symbol: "ETH",
		decimals: 18,
	}),
}));

const provider = {};
const safeAddress = "0x123";
const chainId = 1n;

describe("BalancesSection", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it("renders native and ERC20 balances", () => {
		render(
			<BalancesSection
				provider={provider as unknown as JsonRpcApiProvider}
				safeAddress={safeAddress}
				chainId={chainId}
				onSendNative={() => {}}
				onSendToken={() => {}}
			/>,
		);
		expect(screen.getByText("Native Token")).toBeInTheDocument();
		expect(screen.getByText("1.0 ETH")).toBeInTheDocument();
		expect(screen.getByText("ERC20 Tokens")).toBeInTheDocument();
		expect(screen.getByText("TokenA (TKA)")).toBeInTheDocument();
	});

	it("calls onSendNative when SendButton clicked", () => {
		const onSendNative = vi.fn();
		render(
			<BalancesSection
				provider={provider as unknown as JsonRpcApiProvider}
				safeAddress={safeAddress}
				chainId={chainId}
				onSendNative={onSendNative}
				onSendToken={() => {}}
			/>,
		);
		fireEvent.click(screen.getAllByRole("button", { name: "Send" })[0]);
		expect(onSendNative).toHaveBeenCalled();
	});

	it("calls onSendToken when SendButton for token clicked", () => {
		const onSendToken = vi.fn();
		render(
			<BalancesSection
				provider={provider as unknown as JsonRpcApiProvider}
				safeAddress={safeAddress}
				chainId={chainId}
				onSendNative={() => {}}
				onSendToken={onSendToken}
			/>,
		);
		fireEvent.click(screen.getAllByRole("button", { name: "Send" })[1]);
		expect(onSendToken).toHaveBeenCalledWith("0x1");
	});

	it("shows error message for native balance error", async () => {
		vi.doMock("@/hooks/useNativeBalance", () => ({
			useNativeBalance: () => ({
				data: undefined,
				isLoading: false,
				error: { name: "Error", message: "Native error" },
				isError: true,
				isPending: false,
				isLoadingError: false,
				isRefetchError: false,
			}),
		}));

		const { BalancesSection } = await import("./BalancesSection");
		render(
			<BalancesSection
				provider={provider as unknown as JsonRpcApiProvider}
				safeAddress={safeAddress}
				chainId={chainId}
				onSendNative={() => {}}
				onSendToken={() => {}}
			/>,
		);
		expect(screen.getByText("Native error")).toBeInTheDocument();
	});

	it("shows error message for ERC20 tokens error", async () => {
		vi.doMock("@/hooks/useERC20Tokens", () => ({
			useERC20Tokens: () => ({
				tokens: [],
				isLoading: false,
				error: "ERC20 error",
			}),
		}));
		const { BalancesSection } = await import("./BalancesSection");
		render(
			<BalancesSection
				provider={provider as unknown as JsonRpcApiProvider}
				safeAddress={safeAddress}
				chainId={chainId}
				onSendNative={() => {}}
				onSendToken={() => {}}
			/>,
		);
		expect(screen.getByText("ERC20 error")).toBeInTheDocument();
	});
});
