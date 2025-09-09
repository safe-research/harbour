import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import type { BrowserProvider, JsonRpcApiProvider } from "ethers";
import { beforeEach, describe, expect, it, vi } from "vitest";

const safeAddress = "0xSafe";
const chainId = 1n;
const browserProvider = { provider: {} } as unknown as BrowserProvider;
const rpcProvider = {} as unknown as JsonRpcApiProvider;
const config = {
	owners: ["0xOwner1"],
	threshold: 1,
	fallbackHandler: "0xFallbackHandler",
	nonce: "1",
	modules: [],
	guard: "0xGuard",
	singleton: "0xSingleton",
	encryptedQueue: null,
};

describe("NativeTransferForm", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it("renders form fields and disables Add to Batch initially", async () => {
		vi.doMock("@/hooks/useNativeBalance", () => ({
			useNativeBalance: () => ({
				data: undefined,
				isLoading: false,
				error: null,
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
		vi.doMock("@/contexts/BatchTransactionsContext", () => ({
			useBatch: () => ({
				addTransaction: vi.fn(),
			}),
		}));
		const { NativeTransferForm } = await import("./NativeTransferForm");
		render(
			<NativeTransferForm
				safeAddress={safeAddress}
				chainId={chainId}
				browserProvider={browserProvider}
				rpcProvider={rpcProvider}
				config={config}
				encryptedQueue={null}
			/>,
		);
		expect(screen.getByText(/Recipient Address/)).toBeInTheDocument();
		expect(screen.getByText(/Amount \(ETH\)/)).toBeInTheDocument();
		expect(screen.getByText(/Nonce/)).toBeInTheDocument();
		expect(screen.getByText(/Add to Batch/)).toBeInTheDocument();
		expect(
			screen.getByText(/Sign & Enqueue Native Transfer/),
		).toBeInTheDocument();
	});

	it("shows balance when loaded", async () => {
		vi.doMock("@/hooks/useNativeBalance", () => ({
			useNativeBalance: () => ({
				data: "1000000000000000000",
				isLoading: false,
				error: null,
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
		vi.doMock("@/contexts/BatchTransactionsContext", () => ({
			useBatch: () => ({
				addTransaction: vi.fn(),
			}),
		}));
		const { NativeTransferForm } = await import("./NativeTransferForm");
		render(
			<NativeTransferForm
				safeAddress={safeAddress}
				chainId={chainId}
				browserProvider={browserProvider}
				rpcProvider={rpcProvider}
				config={config}
				encryptedQueue={null}
			/>,
		);
		expect(screen.getByText(/Balance: 1.0 ETH/)).toBeInTheDocument();
	});
});
