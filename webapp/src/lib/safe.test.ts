import { ethers, type JsonRpcApiProvider, type JsonRpcSigner } from "ethers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	getSafeTransaction,
	getSafeTransactionHash,
	signSafeTransaction,
} from "./safe";

describe("safe", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it("getSafeTransaction should return a FullSafeTransaction with defaults", () => {
		const tx = getSafeTransaction({
			chainId: 123n,
			safeAddress: "0x456",
			to: "0x789",
		});
		expect(tx.chainId).toBe(123n);
		expect(tx.safeAddress).toBe("0x456");
		expect(tx.to).toBe("0x789");
		expect(tx.value).toBe("0");
		expect(tx.data).toBe("0x");
		expect(tx.nonce).toBe("0");
		expect(tx.operation).toBe(0);
		expect(tx.safeTxGas).toBe("0");
		expect(tx.baseGas).toBe("0");
		expect(tx.gasPrice).toBe("0");
		expect(tx.gasToken).toBe(ethers.ZeroAddress);
		expect(tx.refundReceiver).toBe(ethers.ZeroAddress);
	});

	it("getSafeTransactionHash should return a hash string", () => {
		const tx = getSafeTransaction({
			chainId: 123n,
			safeAddress: "0x0000000000000000000000000000000000000001",
			to: "0x0000000000000000000000000000000000000002",
		});
		const hash = getSafeTransactionHash(tx);
		expect(hash).toEqual(
			"0xe284a07dbf0c9a1e91969287a9881e8f093634ce2b9cc9cc8737c15da0ccee1b",
		);
	});

	it("signSafeTransaction should call signer.signTypedData", async () => {
		const tx = getSafeTransaction({
			chainId: 1n,
			safeAddress: "0x0000000000000000000000000000000000000001",
			to: "0x0000000000000000000000000000000000000002",
		});
		const signer = {
			signTypedData: vi.fn().mockResolvedValue("0xsignature"),
		};
		const sig = await signSafeTransaction(
			signer as unknown as JsonRpcSigner,
			tx,
		);
		expect(signer.signTypedData).toHaveBeenCalled();
		expect(sig).toBe("0xsignature");
	});

	it("getSafeConfiguration should call aggregateMulticall and return SafeConfiguration", async () => {
		const provider = {};
		const safeAddress = "0x0000000000000000000000000000000000000001";
		const mockResult = [
			{
				returnData: ethers.AbiCoder.defaultAbiCoder().encode(
					["address[]"],
					[
						[
							"0x0000000000000000000000000000000000000002", // owner 1
							"0x0000000000000000000000000000000000000003", // owner 2
						],
					],
				),
			},
			{
				returnData: ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [2]),
			},
			{
				returnData: ethers.AbiCoder.defaultAbiCoder().encode(
					["bytes"],
					[
						ethers.zeroPadValue(
							"0x0000000000000000000000000000000000000004",
							32,
						),
					], // fallbackHandler
				),
			},
			{
				returnData: ethers.AbiCoder.defaultAbiCoder().encode(["uint256"], [5]), // nonce
			},
			{
				returnData: ethers.AbiCoder.defaultAbiCoder().encode(
					["bytes"],
					[
						ethers.zeroPadValue(
							"0x0000000000000000000000000000000000000006",
							32,
						),
					], // guard
				),
			},
			{
				returnData: ethers.AbiCoder.defaultAbiCoder().encode(
					["bytes"],
					[
						ethers.zeroPadValue(
							"0x0000000000000000000000000000000000000007",
							32,
						),
					], // singleton
				),
			},
			{
				returnData: ethers.AbiCoder.defaultAbiCoder().encode(
					["address[]"],
					[["0x0000000000000000000000000000000000000008"]], // modules
				),
			},
		];
		vi.doMock("./multicall", () => ({
			aggregateMulticall: vi.fn().mockResolvedValue(mockResult),
		}));
		const { getSafeConfiguration } = await import("./safe");
		const config = await getSafeConfiguration(
			provider as JsonRpcApiProvider,
			safeAddress,
		);
		expect(config.owners).toEqual([
			"0x0000000000000000000000000000000000000002",
			"0x0000000000000000000000000000000000000003",
		]);
		expect(config.threshold).toBe(2);
		expect(config.fallbackHandler).toEqual(
			"0x0000000000000000000000000000000000000004",
		);
		expect(config.nonce).toEqual("5");
		expect(config.guard).toEqual("0x0000000000000000000000000000000000000006");
		expect(config.singleton).toEqual(
			"0x0000000000000000000000000000000000000007",
		);
		expect(config.modules).toEqual([
			"0x0000000000000000000000000000000000000008",
		]);
	});
});
