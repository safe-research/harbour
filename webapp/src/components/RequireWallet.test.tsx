import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

describe("RequireWallet", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it("shows connect prompt when no wallet", async () => {
		vi.doMock("@web3-onboard/react", () => ({
			useConnectWallet: () => [{ wallet: null }, vi.fn()],
		}));

		const { RequireWallet } = await import("./RequireWallet");
		render(<RequireWallet>children</RequireWallet>);
		expect(screen.getByText(/Connect Your Wallet/)).toBeInTheDocument();
		expect(screen.getByText(/Connect Wallet/)).toBeInTheDocument();
	});

	it("renders children when wallet and provider are ready", async () => {
		const mockEIP1193Provider = {
			request: vi.fn(),
			on: vi.fn(),
			removeListener: vi.fn(),
		};

		vi.doMock("@web3-onboard/react", () => ({
			useConnectWallet: () => [
				{ wallet: { provider: mockEIP1193Provider } },
				vi.fn(),
			],
		}));
		vi.doMock("./RequireWallet", async () => {
			const actual =
				await vi.importActual<typeof import("./RequireWallet")>(
					"./RequireWallet",
				);
			return {
				...actual,
				RequireWallet: actual.RequireWallet,
				useBrowserProvider: () => ({}),
			};
		});
		const { RequireWallet } = await import("./RequireWallet");
		render(<RequireWallet>children</RequireWallet>);
		expect(screen.getByText("children")).toBeInTheDocument();
	});

	it("calls connect when button is clicked", async () => {
		const connect = vi.fn();
		vi.doMock("@web3-onboard/react", () => ({
			useConnectWallet: () => [{ wallet: null }, connect],
		}));
		vi.doMock("./RequireWallet", async () => {
			const actual =
				await vi.importActual<typeof import("./RequireWallet")>(
					"./RequireWallet",
				);
			return { ...actual, useBrowserProvider: () => undefined };
		});
		const { RequireWallet } = await import("./RequireWallet");
		render(<RequireWallet>children</RequireWallet>);
		fireEvent.click(screen.getByText(/Connect Wallet/));
		expect(connect).toHaveBeenCalled();
	});
});
