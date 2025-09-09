import { act, renderHook } from "@testing-library/react";
import type { BrowserProvider } from "ethers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SafeConfiguration } from "@/lib/safe";

const safeAddress = "0xSafe";
const chainId = 123n;
const browserProvider = {} as unknown as BrowserProvider;
const config = { nonce: "1" } as unknown as SafeConfiguration;
const parser = vi.fn().mockImplementation((_input) => ({
	to: "0xRecipient",
	nonce: "1",
	value: "1",
	data: "0x",
}));

// Mock dependencies
vi.mock("@tanstack/react-router", () => ({
	useNavigate: () => vi.fn(),
}));
vi.mock("@/contexts/WakuContext", () => ({
	useWaku: () => ({}),
}));

describe("useSignAndEnqueue", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it("submits and sets txHash on success", async () => {
		vi.doMock("@/lib/harbour", () => ({
			signAndEnqueueSafeTransaction: vi
				.fn()
				.mockResolvedValue({ transactionHash: "0xTxHash" }),
		}));
		vi.doMock("@/lib/safe", () => ({
			getSafeTransaction: vi.fn().mockReturnValue({}),
		}));
		const { useSignAndEnqueue } = await import("./useSignAndEnqueue");
		const { result } = renderHook(() =>
			useSignAndEnqueue({
				safeAddress,
				chainId,
				browserProvider,
				config,
				parser,
				encryptedQueue: null,
			}),
		);
		await act(async () => {
			await result.current.signAndEnqueue({});
		});
		expect(result.current.txHash).toBe("0xTxHash");
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
		const { useSignAndEnqueue } = await import("./useSignAndEnqueue");
		const { result } = renderHook(() =>
			useSignAndEnqueue({
				safeAddress,
				chainId,
				browserProvider,
				config,
				parser,
				encryptedQueue: null,
			}),
		);
		await act(async () => {
			await result.current.signAndEnqueue({});
		});
		expect(result.current.error).toBe("fail");
		expect(result.current.txHash).toBeUndefined();
		expect(result.current.isSubmitting).toBe(false);
	});

	it("calls onEnqueued callback", async () => {
		vi.doMock("@/lib/harbour", () => ({
			signAndEnqueueSafeTransaction: vi
				.fn()
				.mockResolvedValue({ transactionHash: "0xTxHash" }),
		}));
		vi.doMock("@/lib/safe", () => ({
			getSafeTransaction: vi.fn().mockReturnValue({}),
		}));
		const onEnqueued = vi.fn();
		const { useSignAndEnqueue } = await import("./useSignAndEnqueue");
		const { result } = renderHook(() =>
			useSignAndEnqueue({
				safeAddress,
				chainId,
				browserProvider,
				config,
				parser,
				onEnqueued,
				encryptedQueue: null,
			}),
		);
		await act(async () => {
			await result.current.signAndEnqueue({});
		});
		expect(onEnqueued).toHaveBeenCalled();
	});
});
