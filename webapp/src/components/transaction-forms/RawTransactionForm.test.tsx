import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import type { BrowserProvider, JsonRpcApiProvider } from "ethers";
import { beforeEach, describe, expect, it, vi } from "vitest";

const safeAddress = "0xSafe";
const chainId = 1n;
const browserProvider = { provider: {} } as unknown as BrowserProvider;
const config = {
	owners: ["0xOwner1"],
	threshold: 1,
	fallbackHandler: "0xFallbackHandler",
	nonce: "1",
	modules: [],
	guard: "0xGuard",
	singleton: "0xSingleton",
};
const rpcProvider = {} as unknown as JsonRpcApiProvider;

describe("RawTransactionForm", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it("renders form fields and disables Add to Batch initially", async () => {
		vi.doMock("@/hooks/useSignAndEnqueue", () => ({
			useSignAndEnqueue: () => ({
				isSubmitting: false,
				error: null,
				txHash: null,
				signAndEnqueue: vi.fn(),
			}),
		}));
		vi.doMock("@/contexts/BatchTransactionsContext", () => ({
			useBatch: () => ({
				addTransaction: vi.fn(),
			}),
		}));
		const { RawTransactionForm } = await import("./RawTransactionForm");
		render(
			<RawTransactionForm
				safeAddress={safeAddress}
				chainId={chainId}
				browserProvider={browserProvider}
				config={config}
				rpcProvider={rpcProvider}
			/>,
		);
		expect(screen.getByLabelText(/To Address/)).toBeInTheDocument();
		expect(screen.getByLabelText(/Value \(ETH\)/)).toBeInTheDocument();
		expect(screen.getByLabelText(/Data \(Hex String\)/)).toBeInTheDocument();
		expect(screen.getByLabelText(/Nonce/)).toBeInTheDocument();
		expect(screen.getByText(/Add to Batch/)).toBeInTheDocument();
		expect(
			screen.getByText(/Sign & Enqueue Raw Transaction/),
		).toBeInTheDocument();
	});
});
