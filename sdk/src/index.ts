import { Contract, type Provider, type Signer, type TransactionResponse, ethers } from "ethers";
import { aggregateMulticall } from "./lib/multicall";
import type { ChainId, SDKFullSafeTransaction, SDKHarbourSignature, SDKTransactionDetails } from "./types";

// Internal type for decoded retrieveTransaction result from Harbour
type RetrieveTransactionResult = {
	stored: boolean;
	operation: number;
	to: string;
	value: bigint;
	safeTxGas: bigint;
	baseGas: bigint;
	gasPrice: bigint;
	gasToken: string;
	refundReceiver: string;
	data: string;
};

const HARBOUR_ADDRESS = "0x5E669c1f2F9629B22dd05FBff63313a49f87D4e6" as const;

/**
 * Minimal ABI for the Harbour methods we interact with.
 * Keeping the ABI small speeds up contract instantiation and makes the file
 * self‑contained.
 */
const HARBOUR_ABI = [
	"function enqueueTransaction(address safeAddress, uint256 chainId, uint256 nonce, address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signature) external",
	"function retrieveSignatures(address signerAddress, address safeAddress, uint256 chainId, uint256 nonce, uint256 start, uint256 count) external view returns (tuple(bytes32 r, bytes32 vs, bytes32 txHash)[] page, uint256 totalCount)",
	"function retrieveTransaction(bytes32 safeTxHash) view returns (tuple(bool stored,uint8 operation,address to,uint128 value,uint128 safeTxGas,uint128 baseGas,uint128 gasPrice,address gasToken,address refundReceiver,bytes data) txParams)",
] as const;

/**
 * Internal helper returning a Harbour contract bound to **providerOrSigner**.
 *
 * @param providerOrSigner - ethers Provider or Signer.
 */
const harbour = (providerOrSigner: Provider | Signer) => new Contract(HARBOUR_ADDRESS, HARBOUR_ABI, providerOrSigner);

/**
 * Represents a Safe transaction along with its collected signatures and unique transaction hash.
 * This interface is specific to the output of the `getTransactions` function.
 */
interface TransactionWithSignatures {
	/** The details of the Safe transaction. */
	details: SDKTransactionDetails;
	/** An array of signatures collected for the transaction. */
	signatures: SDKHarbourSignature[];
	/** The unique transaction hash (SafeTxHash). */
	safeTxHash: string;
}

/**
 * Retrieves transactions and their signatures for a specific Safe nonce from Harbour.
 *
 * @param provider - An ethers.js Provider instance.
 * @param safeAddress - The address of the Safe contract.
 * @param safeChainId - The chain ID where the Safe contract is deployed.
 * @param owners - An array of owner addresses for the Safe.
 * @param nonce - The specific nonce to fetch transactions for.
 * @returns A promise that resolves to an array of transactions with their signatures.
 */
async function getTransactions(
	provider: Provider,
	safeAddress: string,
	safeChainId: ChainId,
	owners: string[],
	nonce: number,
): Promise<TransactionWithSignatures[]> {
	const harbourInstance = harbour(provider);
	const iface = harbourInstance.interface;
	const signaturesByTxHash = new Map<string, SDKHarbourSignature[]>();
	const uniqueTxHashes = new Set<string>();

	// Batch signature retrieval via multicall
	const signatureCalls = owners.map((owner) => ({
		target: HARBOUR_ADDRESS,
		callData: iface.encodeFunctionData("retrieveSignatures", [owner, safeAddress, safeChainId, nonce, 0, 100]),
	}));
	const signatureResults = await aggregateMulticall(provider, signatureCalls);
	signatureResults.forEach((result, idx) => {
		if (!result.success) return;
		const owner = owners[idx];
		const [page] = iface.decodeFunctionResult("retrieveSignatures", result.returnData) as unknown as [
			Array<[string, string, string]>,
			bigint,
		];
		for (const sigTuple of page) {
			const harbourSignature: SDKHarbourSignature = {
				r: sigTuple[0],
				vs: sigTuple[1],
				txHash: sigTuple[2],
				signer: owner,
			};
			uniqueTxHashes.add(harbourSignature.txHash);
			const existing = signaturesByTxHash.get(harbourSignature.txHash) || [];
			existing.push(harbourSignature);
			signaturesByTxHash.set(harbourSignature.txHash, existing);
		}
	});

	// Batch transaction detail retrieval via multicall
	const txHashes = Array.from(uniqueTxHashes);
	const txCalls = txHashes.map((txHash) => ({
		target: HARBOUR_ADDRESS,
		callData: iface.encodeFunctionData("retrieveTransaction", [txHash]),
	}));
	const txResults = await aggregateMulticall(provider, txCalls);
	const transactionDetailsMap = new Map<string, SDKTransactionDetails>();
	txResults.forEach((result, idx) => {
		if (!result.success) return;
		const txHash = txHashes[idx];
		const [txParams] = iface.decodeFunctionResult("retrieveTransaction", result.returnData) as unknown as [
			RetrieveTransactionResult,
		];
		if (txParams.stored) {
			transactionDetailsMap.set(txHash, {
				to: txParams.to,
				value: txParams.value.toString(),
				data: txParams.data,
				operation: Number(txParams.operation),
				stored: txParams.stored,
				safeTxGas: txParams.safeTxGas.toString(),
				baseGas: txParams.baseGas.toString(),
				gasPrice: txParams.gasPrice.toString(),
				gasToken: txParams.gasToken,
				refundReceiver: txParams.refundReceiver,
			});
		}
	});

	// Assemble Results
	const results: TransactionWithSignatures[] = [];
	for (const [txHash, signatures] of signaturesByTxHash.entries()) {
		const details = transactionDetailsMap.get(txHash);
		if (details) {
			// Ensure details were fetched and transaction was marked as stored
			results.push({
				details,
				signatures,
				safeTxHash: txHash,
			});
		}
	}

	return results;
}

/**
 * Enqueues a Safe transaction to the Harbour contract.
 *
 * @param signer - An ethers.js Signer instance for signing the transaction.
 * @param transaction - The full details of the Safe transaction to enqueue.
 * @param signature - The EIP-712 signature for the transaction.
 * @returns A promise that resolves to the transaction receipt once mined, or null if the transaction is replaced or dropped.
 * @throws If the signer is not connected to a provider.
 */
async function enqueueTransaction(
	signer: Signer,
	transaction: SDKFullSafeTransaction,
	signature: string,
): Promise<TransactionResponse> {
	if (!signer.provider) {
		throw new Error("Signer must be connected to a provider.");
	}

	return harbour(signer).enqueueTransaction(
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
}

export type { TransactionWithSignatures };
export { HARBOUR_ADDRESS, HARBOUR_ABI, getTransactions, enqueueTransaction };
