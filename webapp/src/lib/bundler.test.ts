import type { Contract, JsonRpcProvider, JsonRpcSigner } from "ethers";
import { solidityPacked, Wallet } from "ethers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildUserOp, getUserOpGasPrice, type UserOpRequest } from "./bundler";
import type { FullSafeTransaction } from "./types";

// Stub getSafeTransactionHash so buildUserOp doesn't depend on its internals.
vi.mock("./safe", () => ({
	getSafeTransactionHash: vi.fn(() => `0x${"11".repeat(32)}`),
}));

const HARDHAT_PK =
	"0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

describe("bundler", () => {
	beforeEach(() => vi.restoreAllMocks());

	it("getUserOpGasPrice: uses default 2x baseFee + priority", async () => {
		const send = vi.fn().mockImplementation((method: string) => {
			if (method === "eth_feeHistory") {
				// baseFeePerGas[0] = 0x10 (16n); 2x → 32n; + 0x5 → 37n (0x25)
				return Promise.resolve({ baseFeePerGas: ["0x10"] });
			}
			if (method === "eth_maxPriorityFeePerGas") {
				return Promise.resolve("0x5");
			}
			return Promise.reject(new Error(`Unexpected ${method}`));
		});
		const provider = { send } as unknown as JsonRpcProvider;

		const out = await getUserOpGasPrice(provider);
		expect(out).toEqual({ maxFeePerGas: "0x25", maxPriorityFeePerGas: "0x5" });
		expect(send).toHaveBeenCalledWith("eth_feeHistory", [
			"0x1",
			"latest",
			[100],
		]);
		expect(send).toHaveBeenCalledWith("eth_maxPriorityFeePerGas", []);
	});

	it("getUserOpGasPrice: honors custom basePriceMultiplier", async () => {
		const send = vi.fn().mockImplementation((method: string) => {
			if (method === "eth_feeHistory") {
				// baseFeePerGas[0] = 0x10 (16n); 3x → 48n; + 0x5 → 53n (0x35)
				return Promise.resolve({ baseFeePerGas: ["0x10"] });
			}
			if (method === "eth_maxPriorityFeePerGas") {
				return Promise.resolve("0x5");
			}
			return Promise.reject(new Error(`Unexpected ${method}`));
		});
		const provider = { send } as unknown as JsonRpcProvider;

		const out = await getUserOpGasPrice(provider, 3n);
		expect(out).toEqual({ maxFeePerGas: "0x35", maxPriorityFeePerGas: "0x5" });
	});

	const mkHarbour = (opts?: {
		addr?: `0x${string}`;
		entryPoint?: `0x${string}`;
		paymaster?: `0x${string}`;
		callData?: `0x${string}`;
		nonce?: bigint;
	}) => {
		const harbour = {
			getAddress: vi
				.fn()
				.mockResolvedValue(
					opts?.addr ?? "0x000000000000000000000000000000000000dEaD",
				),
			getNonce: vi.fn().mockResolvedValue(opts?.nonce ?? 5n),
			TRUSTED_PAYMASTER: vi
				.fn()
				.mockResolvedValue(
					opts?.paymaster ?? "0x000000000000000000000000000000000000BEEF",
				),
			SUPPORTED_ENTRYPOINT: vi
				.fn()
				.mockResolvedValue(
					opts?.entryPoint ?? "0x000000000000000000000000000000000000CeNT",
				),
			interface: {
				encodeFunctionData: vi.fn().mockReturnValue(opts?.callData ?? "0x1234"),
			},
		} as unknown as Contract;
		return harbour;
	};

	const mkSigner = (addr = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8") =>
		({
			getAddress: vi.fn().mockResolvedValue(addr),
		}) as unknown as JsonRpcSigner;

	const mkBundlerProvider = (
		limits?: Partial<Record<keyof UserOpRequest, string>>,
	) => {
		const defaultLimits = {
			preVerificationGas: "0x1",
			verificationGasLimit: "0x2",
			callGasLimit: "0x3",
			paymasterVerificationGasLimit: "0x4",
			paymasterPostOpGasLimit: "0x5",
		};
		const send = vi.fn().mockImplementation((method: string) => {
			if (method === "eth_estimateUserOperationGas") {
				return Promise.resolve({ ...defaultLimits, ...limits });
			}
			return Promise.reject(new Error(`Unexpected ${method}`));
		});
		return { send } as unknown as JsonRpcProvider;
	};

	const tx: FullSafeTransaction = {
		// Only fields accessed are passed to encodeFunctionData; we stub that anyway.
		safeAddress: "0x0000000000000000000000000000000000000001",
		chainId: 100,
		nonce: 1n,
		to: "0x0000000000000000000000000000000000000002",
		value: 0n,
		data: "0x",
		operation: 0,
		safeTxGas: 0n,
		baseGas: 0n,
		gasPrice: 0n,
		gasToken: "0x0000000000000000000000000000000000000000",
		refundReceiver: "0x0000000000000000000000000000000000000000",
	} as unknown as FullSafeTransaction;

	it("buildUserOp (no paymaster): estimates gas and fills fields; signature stays '0x'", async () => {
		const bundler = mkBundlerProvider();
		const harbour = mkHarbour({ callData: "0x1234" });
		const signer = mkSigner();
		const gasFee = { maxFeePerGas: "0xaa", maxPriorityFeePerGas: "0xbb" };

		// Any valid signature string (we won't send it, just parse it)
		const sig = await new Wallet(HARDHAT_PK).signMessage("harbour-test");

		const { userOp, entryPoint } = await buildUserOp(
			bundler,
			harbour,
			signer,
			tx,
			sig,
			gasFee,
			false, // use paymaster
		);

		expect(entryPoint).toBe("0x000000000000000000000000000000000000CeNT");
		// From eth_estimateUserOperationGas (mock)
		expect(userOp.preVerificationGas).toBe("0x1");
		expect(userOp.verificationGasLimit).toBe("0x2");
		expect(userOp.callGasLimit).toBe("0x3");
		// Gas fee from argument
		expect(userOp.maxFeePerGas).toBe("0xaa");
		expect(userOp.maxPriorityFeePerGas).toBe("0xbb");
		// No paymaster fields set
		expect(userOp.paymaster).toBeUndefined();
		// Final signature must be cleared
		expect(userOp.signature).toBe("0x");

		// Ensure estimate was called exactly once
		const sendMock = bundler.send as ReturnType<typeof vi.fn>;
		expect(sendMock).toHaveBeenCalledTimes(1);
		const [method, [payloadUserOp, calledEntryPoint]] = sendMock.mock.calls[0];
		expect(method).toBe("eth_estimateUserOperationGas");
		expect(calledEntryPoint).toBe(entryPoint);
		// For the estimation call (no paymaster), signature should have been "0x"
		expect(payloadUserOp.signature).toBe("0x");
	});

	it("buildUserOp (with paymaster): sets dummy paymaster fields for estimation; resets signature afterward", async () => {
		const bundler = mkBundlerProvider();
		const harbour = mkHarbour({ callData: "0x1234" });
		const signer = mkSigner();
		const gasFee = { maxFeePerGas: "0x777", maxPriorityFeePerGas: "0x1" };
		const sig = await new Wallet(HARDHAT_PK).signMessage("harbour-test");

		const { userOp, entryPoint } = await buildUserOp(
			bundler,
			harbour,
			signer,
			tx,
			sig,
			gasFee,
			true, // use paymaster
		);

		// Verify the estimation payload had paymaster fields + non-empty signature
		const sendMock = bundler.send as ReturnType<typeof vi.fn>;
		expect(sendMock).toHaveBeenCalledTimes(1);
		const [method, [payloadUserOp, calledEntryPoint]] = sendMock.mock.calls[0];
		expect(method).toBe("eth_estimateUserOperationGas");
		expect(calledEntryPoint).toBe(entryPoint);

		// For estimation: signature should be empty
		expect(typeof payloadUserOp.signature).toBe("string");
		expect(payloadUserOp.signature).toBe("0x");

		// For estimation: paymaster params must be present
		expect(payloadUserOp.paymaster).toBe(
			"0x000000000000000000000000000000000000BEEF",
		);
		// Default encodePaymasterData() packs two uint48 zeros:
		const expectedPaymasterData = solidityPacked(["uint48", "uint48"], [0, 0]);
		expect(payloadUserOp.paymasterData).toBe(expectedPaymasterData);

		expect(payloadUserOp.callGasLimit).toBe("0x3");
		expect(payloadUserOp.verificationGasLimit).toBe("0x2");

		// After buildUserOp returns, signature is reset and gas fees/limits are filled from mocks
		expect(userOp.signature).toBe("0x");
		expect(userOp.maxFeePerGas).toBe("0x777");
		expect(userOp.maxPriorityFeePerGas).toBe("0x1");
		expect(userOp.preVerificationGas).toBe("0x1");
		expect(userOp.verificationGasLimit).toBe("0x2");
		expect(userOp.callGasLimit).toBe("0x3");
		expect(userOp.paymasterVerificationGasLimit).toBe("0x4");
		expect(userOp.paymasterPostOpGasLimit).toBe("0x5");
	});

	it("buildUserOp: limitsOverwrite bypasses bundler estimation", async () => {
		const bundler = mkBundlerProvider(); // should NOT be used
		const harbour = mkHarbour({ callData: "0x1234" });
		const signer = mkSigner();
		const gasFee = { maxFeePerGas: "0x1", maxPriorityFeePerGas: "0x2" };
		const sig = await new Wallet(HARDHAT_PK).signMessage("harbour-test");

		const limitsOverwrite = {
			preVerificationGas: "0x10",
			verificationGasLimit: "0x20",
			callGasLimit: "0x30",
			paymasterVerificationGasLimit: "0x40",
			paymasterPostOpGasLimit: "0x50",
		};

		const { userOp } = await buildUserOp(
			bundler,
			harbour,
			signer,
			tx,
			sig,
			gasFee,
			false, // use paymaster
			limitsOverwrite,
		);

		// bundlerProvider.send should not be called at all
		const sendMock = bundler.send as ReturnType<typeof vi.fn>;
		expect(sendMock).not.toHaveBeenCalled();

		// Returned limits come from limitsOverwrite
		expect(userOp.preVerificationGas).toBe("0x10");
		expect(userOp.verificationGasLimit).toBe("0x20");
		expect(userOp.callGasLimit).toBe("0x30");
		expect(userOp.paymasterVerificationGasLimit).toBe("0x40");
		expect(userOp.paymasterPostOpGasLimit).toBe("0x50");
	});
});
