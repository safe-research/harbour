import { act, renderHook } from "@testing-library/react";
import type { BrowserProvider } from "ethers";
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from "vitest";

const params = {
	safeAddress: "0xSafe",
	chainId: 1n,
	browserProvider: {} as unknown as BrowserProvider,
	to: "0xRecipient",
	value: "1",
	data: "0x",
	nonce: "1",
	topic: "topic",
	reqId: "42",
};

vi.mock("@/contexts/WakuContext", () => ({ useWaku: () => ({}) }));
vi.mock("@/hooks/walletConnect", () => ({
	useWalletConnect: () => ({
		walletkit: {
			respondSessionRequest: vi.fn().mockResolvedValue(undefined),
		},
	}),
}));

describe("useWalletConnectTransaction", () => {
	// Suppress error logs in test to not spam the console when running tests.
	// Restore after all tests in this suite.
	let errorSpy: ReturnType<typeof vi.spyOn>;

	beforeAll(() => {
		errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
	});

	afterAll(() => {
		errorSpy.mockRestore();
	});
	beforeEach(() => {
		vi.resetModules();
	});

	it("submits transaction and sets transactionHash on success", async () => {
		vi.doMock("@/lib/harbour", () => ({
			signAndEnqueueSafeTransaction: vi
				.fn()
				.mockResolvedValue({ transactionHash: "0xTxHash", hash: "0xTxHash" }),
		}));
		vi.doMock("@/lib/safe", () => ({
			getSafeTransaction: vi.fn().mockReturnValue({}),
		}));
		const { useWalletConnectTransaction } = await import(
			"./useWalletConnectTransaction"
		);
		const { result } = renderHook(() => useWalletConnectTransaction());
		await act(async () => {
			await result.current.submitTransaction(params);
		});
		expect(result.current.transactionHash).toBe("0xTxHash");
		expect(result.current.error).toBeUndefined();
		expect(result.current.isSubmitting).toBe(false);
	});

	it("sets error if signAndEnqueueSafeTransaction throws", async () => {
		vi.doMock("@/lib/harbour", () => ({
			signAndEnqueueSafeTransaction: vi
				.fn()
				.mockRejectedValue(new Error("fail")),
		}));
		vi.doMock("@/lib/safe", () => ({
			getSafeTransaction: vi.fn().mockReturnValue({}),
		}));
		const { useWalletConnectTransaction } = await import(
			"./useWalletConnectTransaction"
		);
		const { result } = renderHook(() => useWalletConnectTransaction());
		await act(async () => {
			await result.current.submitTransaction(params);
		});
		expect(result.current.error).toBe("fail");
		expect(result.current.transactionHash).toBeUndefined();
		expect(result.current.isSubmitting).toBe(false);
	});

	it("sets warning if WalletConnect response fails", async () => {
		vi.doMock("@/lib/harbour", () => ({
			signAndEnqueueSafeTransaction: vi
				.fn()
				.mockResolvedValue({ transactionHash: "0xTxHash", hash: "0xTxHash" }),
		}));
		vi.doMock("@/lib/safe", () => ({
			getSafeTransaction: vi.fn().mockReturnValue({}),
		}));
		vi.mock("@/hooks/walletConnect", () => ({
			useWalletConnect: () => ({
				walletkit: {
					respondSessionRequest: vi
						.fn()
						.mockRejectedValue(new Error("wc-fail")),
				},
			}),
		}));
		const { useWalletConnectTransaction } = await import(
			"./useWalletConnectTransaction"
		);
		const { result } = renderHook(() => useWalletConnectTransaction());
		await act(async () => {
			await result.current.submitTransaction(params);
		});
		expect(result.current.warning).toMatch(/WalletConnect response failed/i);
		expect(result.current.transactionHash).toBe("0xTxHash");
		expect(result.current.error).toBeUndefined();
		expect(result.current.isSubmitting).toBe(false);
	});

	it("can clear result state", async () => {
		vi.doMock("@/lib/harbour", () => ({
			signAndEnqueueSafeTransaction: vi
				.fn()
				.mockResolvedValue({ transactionHash: "0xTxHash", hash: "0xTxHash" }),
		}));
		vi.doMock("@/lib/safe", () => ({
			getSafeTransaction: vi.fn().mockReturnValue({}),
		}));
		const { useWalletConnectTransaction } = await import(
			"./useWalletConnectTransaction"
		);
		const { result } = renderHook(() => useWalletConnectTransaction());
		await act(async () => {
			await result.current.submitTransaction(params);
			result.current.clearResult();
		});
		expect(result.current.transactionHash).toBeUndefined();
		expect(result.current.error).toBeUndefined();
		expect(result.current.isSubmitting).toBe(false);
	});
});
