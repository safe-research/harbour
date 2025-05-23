import { Interface, JsonRpcProvider, Wallet } from "ethers";
import type { Signer } from "ethers";
import { HARBOUR_ABI, enqueueTransaction, getTransactions } from "../src/index";
import { aggregateMulticall } from "../src/lib/multicall";
import type { SDKFullSafeTransaction } from "../src/types";

jest.mock("../src/lib/multicall");
const enqueueTransactionMock = jest.fn();

// Mock ethers.Contract to stub enqueueTransaction and expose interface for decoding
jest.mock("ethers", () => {
	const actualEthers = jest.requireActual("ethers");
	return {
		...actualEthers,
		Contract: jest.fn().mockImplementation((address, abi, providerOrSigner) => ({
			interface: new actualEthers.Interface(abi),
			enqueueTransaction: enqueueTransactionMock,
		})),
	};
});

// Shared provider and signer for tests
const provider = new JsonRpcProvider();
const signer: Signer = Wallet.createRandom().connect(provider);

describe("getTransactions", () => {
	const safeAddress = "0x742d35Cc6634C0532925a3b844Bc454e4438f44e";
	const chainId = 1;
	const owners = [Wallet.createRandom().address, Wallet.createRandom().address];
	const nonce = 42;
	const iface = new Interface(HARBOUR_ABI);

	it("should retrieve transactions and signatures correctly", async () => {
		// Prepare signature page for both owners
		const txHash = "0x00000000000000000000000000000000000000000000000000000000000000aa";
		const sigTuple: [string, string, string] = [`0x${"11".repeat(32)}`, `0x${"22".repeat(32)}`, txHash];
		const sigPage = [sigTuple];
		const sigEncoded = iface.encodeFunctionResult("retrieveSignatures", [sigPage, BigInt(1)]);
		(aggregateMulticall as jest.Mock).mockResolvedValueOnce([
			{ success: true, returnData: sigEncoded },
			{ success: true, returnData: sigEncoded },
		]);

		// Prepare transaction details
		const txParams = {
			stored: true,
			operation: 1,
			to: Wallet.createRandom().address,
			value: BigInt(123456),
			safeTxGas: BigInt(21000),
			baseGas: BigInt(21000),
			gasPrice: BigInt(1000000000),
			gasToken: "0x0000000000000000000000000000000000000000",
			refundReceiver: "0x0000000000000000000000000000000000000000",
			data: "0xdeadbeef",
		};
		const txEncoded = iface.encodeFunctionResult("retrieveTransaction", [txParams]);
		(aggregateMulticall as jest.Mock).mockResolvedValueOnce([{ success: true, returnData: txEncoded }]);

		const results = await getTransactions(provider, safeAddress, chainId, owners, nonce);
		expect(results).toHaveLength(1);
		expect(results[0]).toEqual({
			safeTxHash: txHash,
			signatures: owners.map((owner) => ({
				r: sigTuple[0],
				vs: sigTuple[1],
				txHash,
				signer: owner,
			})),
			details: {
				to: txParams.to,
				value: txParams.value.toString(),
				data: txParams.data,
				operation: txParams.operation,
				stored: txParams.stored,
				safeTxGas: txParams.safeTxGas.toString(),
				baseGas: txParams.baseGas.toString(),
				gasPrice: txParams.gasPrice.toString(),
				gasToken: txParams.gasToken,
				refundReceiver: txParams.refundReceiver,
			},
		});
	});
});

describe("enqueueTransaction", () => {
	it("should call harbour.enqueueTransaction with correct parameters", async () => {
		const transaction: SDKFullSafeTransaction = {
			safeAddress: "0x53d284357ec70cE289D6D64134DfAc8E511c8a3D",
			chainId: 4,
			nonce: "7",
			to: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
			value: "10000",
			data: "0xabc123",
			operation: 2,
			safeTxGas: "30000",
			baseGas: "21000",
			gasPrice: "20000000000",
			gasToken: "0x0000000000000000000000000000000000000000",
			refundReceiver: "0x0000000000000000000000000000000000000000",
		};
		const signature = `0x${"aa".repeat(65)}`;
		const dummyTxResponse = { hash: "0xtxhash" };

		enqueueTransactionMock.mockResolvedValue(dummyTxResponse);

		const response = await enqueueTransaction(signer, transaction, signature);
		expect(enqueueTransactionMock).toHaveBeenCalledWith(
			transaction.safeAddress,
			transaction.chainId,
			transaction.nonce,
			transaction.to,
			transaction.value,
			transaction.data,
			transaction.operation,
			transaction.safeTxGas,
			transaction.baseGas,
			transaction.gasPrice,
			transaction.gasToken,
			transaction.refundReceiver,
			signature,
		);
		expect(response).toBe(dummyTxResponse);
	});
});
