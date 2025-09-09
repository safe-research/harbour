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
};

const defaultProps = {
	safeAddress,
	chainId,
	browserProvider,
	rpcProvider,
	config,
	tokenAddress: "0xToken",
	encryptedQueue: null,
};

describe("ERC20TransferForm", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it("renders form fields and disables Add to Batch initially", async () => {
		vi.doMock("react-hook-form", () => {
			const actual =
				vi.importActual<typeof import("react-hook-form")>("react-hook-form");
			return {
				...actual,
				useForm: () => ({
					register: vi.fn(),
					handleSubmit: <T extends unknown[]>(fn: (...args: T) => unknown) =>
						fn,
					watch: (_field: string) => "", // always return empty string for recipient/amount
					formState: { errors: {} },
				}),
			};
		});
		vi.doMock("@/hooks/useERC20TokenDetails", () => ({
			useERC20TokenDetails: () => ({
				data: null,
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
		const { ERC20TransferForm } = await import("./ERC20TransferForm");
		render(<ERC20TransferForm {...defaultProps} />);
		expect(screen.getByLabelText(/Token Contract Address/)).toBeInTheDocument();
		expect(screen.getByLabelText(/Recipient Address/)).toBeInTheDocument();
		expect(screen.getByLabelText(/Amount/)).toBeInTheDocument();
		expect(screen.getByLabelText(/Nonce/)).toBeInTheDocument();
		expect(screen.getByText(/Add to Batch/)).toBeDisabled();
		expect(
			screen.getByText(/Sign & Enqueue ERC20 Transfer/),
		).toBeInTheDocument();
	});

	it("shows token details when loaded", async () => {
		vi.doMock("react-hook-form", () => {
			const actual =
				vi.importActual<typeof import("react-hook-form")>("react-hook-form");
			return {
				...actual,
				useForm: () => ({
					register: vi.fn(),
					handleSubmit: <T extends unknown[]>(fn: (...args: T) => unknown) =>
						fn,
					watch: (_field: string) => "", // always return empty string for recipient/amount
					formState: { errors: {} },
				}),
			};
		});
		vi.doMock("@/hooks/useERC20TokenDetails", () => ({
			useERC20TokenDetails: () => ({
				data: {
					name: "TestToken",
					symbol: "TTK",
					decimals: 18,
					balance: "1000000000000000000",
				},
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
		const { ERC20TransferForm } = await import("./ERC20TransferForm");
		render(<ERC20TransferForm {...defaultProps} />);
		expect(screen.getByText(/Token:/).parentElement).toHaveTextContent(
			"TestToken (TTK)",
		);
		expect(screen.getByText(/Decimals:/).parentElement).toHaveTextContent("18");
		expect(screen.getByText(/Balance:/).parentElement).toHaveTextContent(
			"1.0 TTK",
		);
	});
});
