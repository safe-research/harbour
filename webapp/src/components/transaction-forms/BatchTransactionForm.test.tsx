import type { SafeConfiguration } from "@/lib/safe";
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import type { BrowserProvider, JsonRpcApiProvider } from "ethers";
import { beforeEach, describe, expect, it, vi } from "vitest";

const safeAddress = "0xSafe";
const chainId = 1n;
const browserProvider = {} as unknown as BrowserProvider;
const config = {
	nonce: "1",
} as unknown as SafeConfiguration;
const rpcProvider = {} as unknown as JsonRpcApiProvider;

describe("BatchTransactionForm", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it("shows empty batch message", async () => {
		vi.doMock("@/contexts/BatchTransactionsContext", () => ({
			useBatch: () => ({
				getBatch: () => [],
				removeTransaction: vi.fn(),
				clearBatch: vi.fn(),
			}),
		}));
		vi.doMock("@/hooks/useSignAndEnqueue", () => ({
			useSignAndEnqueue: () => ({
				isSubmitting: false,
				error: null,
				txHash: null,
				signAndEnqueue: vi.fn(),
			}),
		}));
		const { BatchTransactionForm } = await import("./BatchTransactionForm");
		render(
			<BatchTransactionForm
				safeAddress={safeAddress}
				chainId={chainId}
				browserProvider={browserProvider}
				config={config}
				rpcProvider={rpcProvider}
			/>,
		);
		expect(
			screen.getByText(/No transactions added to batch/),
		).toBeInTheDocument();
		expect(screen.getByText(/Enqueue Batch/)).toBeDisabled();
		expect(screen.getByText(/Clear All/)).toBeDisabled();
	});

	it("renders batch transactions and handles remove", async () => {
		const removeTransaction = vi.fn();
		const clearBatch = vi.fn();
		vi.doMock("@/contexts/BatchTransactionsContext", () => ({
			useBatch: () => ({
				getBatch: () => [
					{ to: "0xTo", value: "1000000000000000000", data: "0xData" },
				],
				removeTransaction,
				clearBatch,
			}),
		}));
		vi.doMock("@/hooks/useSignAndEnqueue", () => ({
			useSignAndEnqueue: () => ({
				isSubmitting: false,
				error: null,
				txHash: null,
				signAndEnqueue: vi.fn(),
			}),
		}));
		const { BatchTransactionForm } = await import("./BatchTransactionForm");
		render(
			<BatchTransactionForm
				safeAddress={safeAddress}
				chainId={chainId}
				browserProvider={browserProvider}
				config={config}
				rpcProvider={rpcProvider}
			/>,
		);
		expect(screen.getByText(/Batch Transactions/)).toBeInTheDocument();
		expect(screen.getByText(/To:/)).toBeInTheDocument();
		expect(screen.getByText(/Value:/)).toBeInTheDocument();
		expect(screen.getByText(/ETH/)).toBeInTheDocument();
		expect(screen.getByText(/Remove/)).toBeInTheDocument();
		fireEvent.click(screen.getByText(/Remove/));
		expect(removeTransaction).toHaveBeenCalled();
	});
});
