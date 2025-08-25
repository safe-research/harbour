import type { ContractRunner, JsonRpcApiProvider, Network } from "ethers";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mocks

// Settings
/** Minimal shape we care about in tests */
vi.mock("@/components/settings/SettingsForm", () => {
	type CurrentSettings = {
		rpcUrl?: string;
		bundlerUrl?: string;
		validatorUrl?: string;
		harbourAddress?: string;
	};

	const mockedModule = {
		loadCurrentSettings: vi.fn(), // plain vi.fn()
	} satisfies {
		loadCurrentSettings: () => Promise<CurrentSettings>; // fully typed
	};

	return mockedModule;
});

// Chains (switch + RPC resolver)
vi.mock("./chains", () => ({
	switchToChain: vi.fn(async () => {}),
	getRpcUrlByChainId: vi.fn(async () => "http://example-harbour-rpc"),
}));

// Bundler helpers
vi.mock("./bundler", () => ({
	getUserOpGasPrice: vi.fn(async () => ({
		maxFeePerGas: "0x1",
		maxPriorityFeePerGas: "0x2",
	})),
	buildUserOp: vi.fn(async () => ({
		userOp: { dummy: true, signature: "0x" },
		entryPoint: "0x00000000000000000000000000000000000000EE",
	})),
}));

// Multicall aggregator
vi.mock("./multicall", () => ({
	aggregateMulticall: vi.fn(async () => []),
}));

// Safe signing
vi.mock("./safe", () => ({
	signSafeTransaction: vi.fn(async () => "0xS1G"),
}));

// Ethers: keep the real Interface, but stub JsonRpcProvider & Contract
vi.mock("ethers", async () => {
	const actual = await vi.importActual<typeof import("ethers")>("ethers");

	class MockJsonRpcProvider {
		url: string;
		constructor(url: string) {
			this.url = url;
		}
		// tests can override at runtime via spyOn on the prototype
		send = vi.fn(async (_method: string, _params: unknown[]) => {
			throw new Error("Unexpected provider.send");
		});
		getNetwork = vi.fn(async () => ({ chainId: 100n }));
		getSigner = vi.fn(async () => ({
			getAddress: vi.fn(async () => "0xSigner"),
		}));
	}

	class MockContract {
		address: string;
		abi: Interface;
		runner: null | ContractRunner;
		constructor(
			address: string,
			abi: Interface,
			runner?: null | ContractRunner,
		) {
			this.address = address;
			this.abi = abi;
			this.runner = runner as ContractRunner;
		}
		enqueueTransaction = vi
			.fn()
			.mockResolvedValue({ wait: vi.fn().mockResolvedValue("RECEIPT") });
		getAddress = vi.fn(async () => this.address);
		TRUSTED_PAYMASTER = vi.fn(async () => "0xPAYMASTER");
		SUPPORTED_ENTRYPOINT = vi.fn(async () => "0xENTRY");
		interface = { encodeFunctionData: vi.fn(() => "0xabc") };
	}

	return {
		...actual,
		JsonRpcApiProvider: MockJsonRpcProvider,
		Contract: MockContract,
	};
});

// Imports under test

import { Interface, JsonRpcProvider } from "ethers";
import { loadCurrentSettings } from "@/components/settings/SettingsForm";
import type { WakuManager } from "@/contexts/WakuContext";
import { buildUserOp, getUserOpGasPrice } from "./bundler";
import { switchToChain } from "./chains";
import {
	fetchSafeQueue,
	getHarbourChainId,
	HARBOUR_CHAIN_ID,
	signAndEnqueueSafeTransaction,
} from "./harbour";
import { aggregateMulticall } from "./multicall";
import type { SafeConfiguration } from "./safe";
import type { ChainId, FullSafeTransaction } from "./types";

// Small helper addresses
const OWNER_A = "0x0000000000000000000000000000000000000aaa";
const OWNER_B = "0x0000000000000000000000000000000000000bBB";
const SAFE_ADDR = "0x00000000000000000000000000000000000000ff";
const TXHASH_1 = `0x${"11".repeat(32)}`; // bytes32
const R1 = `0x${"22".repeat(32)}`;
const VS1 = `0x${"33".repeat(32)}`;

describe("harbour", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("fetches transaction queue for given Safe", async () => {
		const iface = new Interface([
			"function retrieveSignatures(address,address,uint256,uint256,uint256,uint256) view returns (tuple(bytes32 r, bytes32 vs, bytes32 txHash)[] page, uint256 totalCount)",
			"function retrieveTransaction(bytes32) view returns (tuple(bool stored,uint8 operation,address to,uint128 value,uint128 safeTxGas,uint128 baseGas,uint128 gasPrice,address gasToken,address refundReceiver,bytes data) txParams)",
		]);

		// 1) First aggregateMulticall: signatures for each (owner, nonce)
		// We'll return signatures for nonce=5 for both owners pointing to the same txHash
		const sigPage = [
			[R1, VS1, TXHASH_1], // (r, vs, txHash)
		];
		const sigReturnDataA = iface.encodeFunctionResult("retrieveSignatures", [
			sigPage,
			1n,
		]);
		const sigReturnDataB = iface.encodeFunctionResult("retrieveSignatures", [
			sigPage,
			1n,
		]);

		// 2) Second aggregateMulticall: details for each unique txHash
		const txStored = iface.encodeFunctionResult("retrieveTransaction", [
			[
				true, // stored
				0, // operation
				"0x0000000000000000000000000000000000000DeA",
				0n, // value
				0n, // safeTxGas
				0n, // baseGas
				0n, // gasPrice
				"0x0000000000000000000000000000000000000000", // gasToken
				"0x0000000000000000000000000000000000000000", // refundReceiver
				"0x", // data
			],
		]);

		// aggregateMulticall is called twice; return signature pages then tx details.
		(aggregateMulticall as unknown as ReturnType<typeof vi.fn>)
			.mockResolvedValueOnce([
				{ returnData: sigReturnDataA },
				{ returnData: sigReturnDataB },
			])
			.mockResolvedValueOnce([{ returnData: txStored }]);

		(
			loadCurrentSettings as unknown as ReturnType<typeof vi.fn>
		).mockResolvedValue({ harbourAddress: "0xHARBOUR" });

		const safeConfig: Pick<SafeConfiguration, "nonce" | "owners"> = {
			nonce: "5",
			owners: [OWNER_A, OWNER_B],
		};

		const groups = await fetchSafeQueue({
			provider: {} as unknown as JsonRpcApiProvider,
			safeAddress: SAFE_ADDR,
			safeConfig: safeConfig,
			safeChainId: 100n satisfies ChainId,
			maxNoncesToFetch: 1,
		});

		expect(groups).toHaveLength(1);
		expect(groups[0].nonce).toBe("5");
		expect(groups[0].transactions).toHaveLength(1);

		const trx = groups[0].transactions[0];
		expect(trx.safeTxHash).toBe(TXHASH_1);
		expect(trx.signatures).toHaveLength(2);
		expect(trx.signatures[0]).toMatchObject({
			r: R1,
			vs: VS1,
			signer: OWNER_A,
		});
		expect(trx.signatures[1]).toMatchObject({
			r: R1,
			vs: VS1,
			signer: OWNER_B,
		});
		// details.stored must be true to be included
		expect(trx.details.stored).toBe(true);
	});

	it("returns chainId from RPC when rpcUrl is configured", async () => {
		vi.mocked(loadCurrentSettings).mockResolvedValue({ rpcUrl: "http://rpc" });
		console.log(JsonRpcProvider.prototype);
		const spy = vi
			.spyOn(JsonRpcProvider.prototype, "getNetwork")
			.mockResolvedValue({ chainId: 123n } as Network);

		const id = await getHarbourChainId();
		expect(id).toBe(123n);
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it("falls back to HARBOUR_CHAIN_ID when no rpcUrl", async () => {
		vi.mocked(loadCurrentSettings).mockResolvedValue({});
		const id = await getHarbourChainId();
		expect(id).toBe(HARBOUR_CHAIN_ID);
	});

	describe("sign and enqueue txs", () => {
		const tx = {
			safeAddress: SAFE_ADDR,
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

		it("short-circuits via Waku when available & send succeeds", async () => {
			vi.mocked(loadCurrentSettings).mockResolvedValue({}); // no bundler
			const waku = {
				isAvailable: () => true,
				send: vi.fn().mockResolvedValue(true),
			} as unknown as WakuManager;

			const walletProvider = {
				getSigner: vi.fn().mockResolvedValue({}),
			} as unknown as JsonRpcApiProvider;

			const res = await signAndEnqueueSafeTransaction(walletProvider, tx, waku);

			expect(switchToChain).toHaveBeenCalledWith(walletProvider, tx.chainId);
			expect(waku.send).toHaveBeenCalledTimes(1);
			expect(res).toEqual({ hash: "", transactionHash: "" });
		});

		it("relays via Bundler (no validator): builds userOp and sends eth_sendUserOperation", async () => {
			vi.mocked(loadCurrentSettings).mockResolvedValue({
				bundlerUrl: "http://bundler",
				rpcUrl: "http://harbour-rpc",
				harbourAddress: "0xHARBOUR",
				// no validatorUrl
			});

			const waku = {
				isAvailable: () => false,
				send: vi.fn(),
			} as unknown;

			// Spy on provider.send to capture the UserOperation submit
			const sendSpy = vi
				.spyOn(JsonRpcProvider.prototype, "send")
				.mockImplementation(async (method: string) => {
					if (method === "eth_sendUserOperation") return "0xHASH";
					throw new Error(`Unexpected send(${method})`);
				});

			const walletProvider = {
				getSigner: vi.fn().mockResolvedValue({}),
			} as unknown as JsonRpcApiProvider;

			const res = await signAndEnqueueSafeTransaction(
				walletProvider,
				tx,
				waku as WakuManager,
			);

			// Switch to chain of Safe to sign
			expect(switchToChain).toHaveBeenCalledWith(walletProvider, tx.chainId);
			// Gas price & userOp were prepared via mocks
			expect(getUserOpGasPrice).toHaveBeenCalledTimes(1);
			expect(buildUserOp).toHaveBeenCalledTimes(1);

			// Submitted to the bundler
			const call = sendSpy.mock.calls.find(
				([m]) => m === "eth_sendUserOperation",
			);
			expect(call).toBeTruthy();
			// Return shape
			expect(res).toEqual({ hash: "0xHASH", transactionHash: "0xHASH" });
		});
	});
});
