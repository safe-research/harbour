import type { JsonRpcApiProvider, JsonRpcSigner } from "ethers";
import { Contract, Interface } from "ethers";
import { aggregateMulticall } from "./multicall";
import type { SafeConfiguration } from "./safe";
import type { FullSafeTransaction, HarbourSignature, HarbourTransactionDetails } from "./types";

const HARBOUR_CHAIN_ID = 100;
const HARBOUR_ADDRESS = "0x5E669c1f2F9629B22dd05FBff63313a49f87D4e6";

const HARBOUR_ABI = [
	"function enqueueTransaction(address safeAddress, uint256 chainId, uint256 nonce, address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signature) external",
	"function retrieveSignatures(address signerAddress, address safeAddress, uint256 chainId, uint256 nonce, uint256 start, uint256 count) external view returns (tuple(bytes32 r, bytes32 vs, bytes32 txHash)[] page, uint256 totalCount)",
	"function retrieveTransaction(bytes32 safeTxHash) view returns (tuple(bool stored,uint8 operation,address to,uint128 value,uint128 safeTxGas,uint128 baseGas,uint128 gasPrice,address gasToken,address refundReceiver,bytes data) txParams)",
];

/**
 * Enqueues a transaction to the Harbour contract
 * @param signer - The ethers.js signer
 * @param request - The transaction request parameters
 * @param signature - The EIP-712 signature
 * @returns The transaction receipt
 */
async function enqueueSafeTransaction(signer: JsonRpcSigner, transaction: FullSafeTransaction, signature: string) {
	const harbourContract = new Contract(HARBOUR_ADDRESS, HARBOUR_ABI, signer);

	const tx = await harbourContract.enqueueTransaction(
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

	return tx.wait();
}

export interface TransactionWithSignatures {
	details: HarbourTransactionDetails;
	signatures: HarbourSignature[];
	safeTxHash: string;
}

export interface NonceGroup {
	nonce: string;
	transactions: TransactionWithSignatures[];
}

interface FetchSafeQueueParams {
	provider: JsonRpcApiProvider;
	safeAddress: string;
	safeConfig: Pick<SafeConfiguration, "nonce" | "owners">;
	chainId: number;
	maxNoncesToFetch?: number;
}

async function fetchSafeQueue({
	provider,
	safeAddress,
	safeConfig,
	chainId,
	maxNoncesToFetch = 5,
}: FetchSafeQueueParams): Promise<NonceGroup[]> {
	const iface = new Interface(HARBOUR_ABI);
	const startNonce = Number(safeConfig.nonce);
	const owners = safeConfig.owners || [];

	// Batch retrieveSignatures calls
	type SigMeta = { owner: string; nonce: string };
	const sigCalls: Array<{ target: string; allowFailure: boolean; callData: string }> = [];
	const sigMeta: SigMeta[] = [];

	for (let i = 0; i < maxNoncesToFetch; i++) {
		const nonce = startNonce + i;
		for (const owner of owners) {
			sigCalls.push({
				target: HARBOUR_ADDRESS,
				allowFailure: false,
				callData: iface.encodeFunctionData("retrieveSignatures", [owner, safeAddress, chainId, nonce, 0, 100]),
			});
			sigMeta.push({ owner, nonce: nonce.toString() });
		}
	}

	const sigResults = await aggregateMulticall(provider, sigCalls);

	// Organize signatures per nonce and txHash
	const nonceMap = new Map<string, Map<string, HarbourSignature[]>>();
	const uniqueTxHashes = new Set<string>();

	sigResults.forEach((res, idx) => {
		const { owner, nonce } = sigMeta[idx];
		if (res.returnData === "0x") return;
		const decodedSignatures = iface.decodeFunctionResult("retrieveSignatures", res.returnData)[0];

		for (const sig of decodedSignatures) {
			const signature = {
				r: sig[0],
				vs: sig[1],
				txHash: sig[2],
				signer: owner,
			};
			uniqueTxHashes.add(sig.txHash);
			let txMap = nonceMap.get(nonce);
			if (!txMap) {
				txMap = new Map();
				nonceMap.set(nonce, txMap);
			}
			const list = txMap.get(signature.txHash) ?? [];
			list.push(signature);
			txMap.set(signature.txHash, list);
		}
	});

	// Batch retrieveTransaction calls
	const txHashes = Array.from(uniqueTxHashes);
	const txCalls = txHashes.map((txHash) => ({
		target: HARBOUR_ADDRESS,
		allowFailure: false,
		callData: iface.encodeFunctionData("retrieveTransaction", [txHash]),
	}));

	const txResults = await aggregateMulticall(provider, txCalls);

	// Decode transaction details
	const txDetailsMap = new Map<string, HarbourTransactionDetails>();

	txResults.forEach((res, idx) => {
		const txHash = txHashes[idx];
		const decodedTx = iface.decodeFunctionResult("retrieveTransaction", res.returnData);
		const [stored, operation, to, value, safeTxGas, baseGas, gasPrice, gasToken, refundReceiver, data] = decodedTx[0];

		txDetailsMap.set(txHash, {
			to,
			value: value.toString(),
			data,
			operation: Number(operation),
			stored,
			safeTxGas: safeTxGas.toString(),
			baseGas: baseGas.toString(),
			gasPrice: gasPrice.toString(),
			gasToken,
			refundReceiver,
		});
	});

	// Assemble NonceGroup array
	const result: NonceGroup[] = [];
	nonceMap.forEach((txMap, nonce) => {
		const group: NonceGroup = { nonce, transactions: [] };
		txMap.forEach((sigs, txHash) => {
			const details = txDetailsMap.get(txHash);
			if (details?.stored) {
				group.transactions.push({ details, signatures: sigs, safeTxHash: txHash });
			}
		});
		if (group.transactions.length) result.push(group);
	});

	return result;
}

export { HARBOUR_CHAIN_ID, HARBOUR_ADDRESS, HARBOUR_ABI, enqueueSafeTransaction, fetchSafeQueue };
