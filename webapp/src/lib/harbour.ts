import {
	Contract,
	type ContractRunner,
	Interface,
	type JsonRpcApiProvider,
	JsonRpcProvider,
	type JsonRpcSigner,
} from "ethers";
import {
	loadCurrentSettings,
	type SettingsFormData,
} from "@/components/settings/SettingsForm";
import { buildUserOp, getUserOpGasPrice } from "./bundler";
import { getRpcUrlByChainId, switchToChain } from "./chains";
import { aggregateMulticall } from "./multicall";
import type { SafeConfiguration } from "./safe";
import { signSafeTransaction } from "./safe";
import type {
	ChainId,
	FullSafeTransaction,
	HarbourSignature,
	HarbourTransactionDetails,
} from "./types";

/** The chain ID where the Harbour contract is deployed. */
const HARBOUR_CHAIN_ID = 100n;
/** The address of the Harbour contract. */
const HARBOUR_ADDRESS = "0x5E669c1f2F9629B22dd05FBff63313a49f87D4e6";

/** ABI for the Harbour contract. */
const HARBOUR_ABI = [
	"function FEE_TOKEN() view returns (address feeToken)",
	"function SUPPORTED_ENTRYPOINT() view returns (address supportedEntrypoint)",
	"function getNonce(address signer) view returns (uint256 userOpNonce)",
	"function depositTokensForSigner(address signer, uint128 amount)",
	"function quotaStatsForSigner(address signer) view returns (uint128 tokenBalance, uint64 usedQuota, uint64 nextQuotaReset)",
	"function availableFreeQuotaForSigner(address signer) view returns (uint64 availableFreeQuota, uint64 usedSignerQuota, uint64 nextSignerQuotaReset)",
	"function storeTransaction(bytes32 safeTxHash, address safeAddress, uint256 chainId, uint256 nonce, address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, address signer, bytes32 r, bytes32 vs) external returns (uint256 listIndex)",
	"function enqueueTransaction(address safeAddress, uint256 chainId, uint256 nonce, address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signature) external",
	"function retrieveSignatures(address signerAddress, address safeAddress, uint256 chainId, uint256 nonce, uint256 start, uint256 count) external view returns (tuple(bytes32 r, bytes32 vs, bytes32 txHash)[] page, uint256 totalCount)",
	"function retrieveTransaction(bytes32 safeTxHash) view returns (tuple(bool stored,uint8 operation,address to,uint128 value,uint128 safeTxGas,uint128 baseGas,uint128 gasPrice,address gasToken,address refundReceiver,bytes data) txParams)",
];

function harbourAt(
	harbourAddress: string | undefined,
	runner?: ContractRunner,
): Contract {
	return new Contract(harbourAddress || HARBOUR_ADDRESS, HARBOUR_ABI, runner);
}

/**
 * Enqueues a transaction to the Harbour contract
 * @param signer - The ethers.js signer
 * @param request - The transaction request parameters
 * @param signature - The EIP-712 signature
 * @returns The transaction receipt
 */
async function enqueueSafeTransaction(
	signer: JsonRpcSigner,
	transaction: FullSafeTransaction,
	signature: string,
	harbourAddress?: string,
) {
	const harbourContract = harbourAt(harbourAddress, signer);

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

/**
 * Represents a Safe transaction along with its collected signatures and unique transaction hash.
 */
export interface TransactionWithSignatures {
	/** The details of the Safe transaction. */
	details: HarbourTransactionDetails;
	/** An array of signatures collected for the transaction. */
	signatures: HarbourSignature[];
	/** The unique transaction hash (SafeTxHash). */
	safeTxHash: string;
}

/**
 * Groups transactions by their Safe nonce.
 */
export interface NonceGroup {
	/** The nonce value as a string. */
	nonce: string;
	/** An array of transactions associated with this nonce. */
	transactions: TransactionWithSignatures[];
}

/**
 * Parameters for the fetchSafeQueue function.
 */
interface FetchSafeQueueParams {
	/** Ethers.js JSON RPC API provider for the Harbour chain. */
	provider: JsonRpcApiProvider;
	/** The address of the Safe contract. */
	safeAddress: string;
	/** Partial Safe configuration, specifically needing nonce and owners. */
	safeConfig: Pick<SafeConfiguration, "nonce" | "owners">;
	/** The chain ID of the Safe contract (not Harbour's chain ID). */
	safeChainId: ChainId;
	/** Optional maximum number of nonces to fetch ahead of the current Safe nonce (default: 5). */
	maxNoncesToFetch?: number;
}

/**
 * Fetches the queue of transactions for a given Safe from the Harbour contract.
 * It retrieves transactions for multiple nonces starting from the Safe's current nonce,
 * collects their signatures, and groups them.
 *
 * @param {FetchSafeQueueParams} params - Parameters for fetching the queue.
 * @returns {Promise<NonceGroup[]>} A promise that resolves to an array of nonce groups, each containing transactions and their signatures.
 */
async function fetchSafeQueue({
	provider,
	safeAddress,
	safeConfig,
	safeChainId,
	maxNoncesToFetch = 5,
}: FetchSafeQueueParams): Promise<NonceGroup[]> {
	const currentSettings = await loadCurrentSettings();
	const harbourAddress = currentSettings?.harbourAddress || HARBOUR_ADDRESS;
	const iface = new Interface(HARBOUR_ABI);
	const startNonce = Number(safeConfig.nonce);
	const owners = safeConfig.owners || [];

	// Batch retrieveSignatures calls
	type SigMeta = { owner: string; nonce: string };
	const sigCalls: Array<{
		target: string;
		allowFailure: boolean;
		callData: string;
	}> = [];
	const sigMeta: SigMeta[] = [];

	for (let i = 0; i < maxNoncesToFetch; i++) {
		const nonce = startNonce + i;
		for (const owner of owners) {
			sigCalls.push({
				target: harbourAddress,
				allowFailure: false,
				callData: iface.encodeFunctionData("retrieveSignatures", [
					owner,
					safeAddress,
					safeChainId,
					nonce,
					0,
					100,
				]),
			});
			sigMeta.push({ owner, nonce: nonce.toString() });
		}
	}

	const sigResults = await aggregateMulticall(provider, sigCalls);

	const nonceMap = new Map<string, Map<string, HarbourSignature[]>>();
	const uniqueTxHashes = new Set<string>();

	sigResults.forEach((res, idx) => {
		const { owner, nonce } = sigMeta[idx];
		if (res.returnData === "0x") return;
		const decodedSignatures = iface.decodeFunctionResult(
			"retrieveSignatures",
			res.returnData,
		)[0];

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

	const txHashes = Array.from(uniqueTxHashes);
	const txCalls = txHashes.map((txHash) => ({
		target: harbourAddress,
		allowFailure: false,
		callData: iface.encodeFunctionData("retrieveTransaction", [txHash]),
	}));
	const txResults = await aggregateMulticall(provider, txCalls);

	const txDetailsMap = new Map<string, HarbourTransactionDetails>();

	txResults.forEach((res, idx) => {
		const txHash = txHashes[idx];
		const decodedTx = iface.decodeFunctionResult(
			"retrieveTransaction",
			res.returnData,
		);
		const [
			stored,
			operation,
			to,
			value,
			safeTxGas,
			baseGas,
			gasPrice,
			gasToken,
			refundReceiver,
			data,
		] = decodedTx[0];

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

	const result: NonceGroup[] = [];
	nonceMap.forEach((txMap, nonce) => {
		const group: NonceGroup = { nonce, transactions: [] };
		txMap.forEach((sigs, txHash) => {
			const details = txDetailsMap.get(txHash);
			if (details?.stored) {
				group.transactions.push({
					details,
					signatures: sigs,
					safeTxHash: txHash,
				});
			}
		});
		if (group.transactions.length) result.push(group);
	});

	return result;
}

async function getChainId(
	currentSettings: Partial<SettingsFormData>,
): Promise<bigint> {
	if (currentSettings.rpcUrl) {
		const provider = new JsonRpcProvider(currentSettings.rpcUrl);
		const network = await provider.getNetwork();
		return network.chainId;
	}
	switchToChain;
	return HARBOUR_CHAIN_ID;
}

async function getHarbourChainId(): Promise<bigint> {
	const currentSettings = await loadCurrentSettings();
	return getChainId(currentSettings);
}

/**
 * Signs a Safe transaction and enqueues it to the Harbour contract.
 * This function handles the complete flow:
 * 1. Switches to the Safe's chain for signing
 * 2. Signs the transaction
 * 3. Switches to the Harbour chain for enqueuing
 * 4. Enqueues the transaction
 *
 * @param walletProvider - The wallet provider for chain switching and signing
 * @param transaction - The complete Safe transaction to sign and enqueue
 * @returns The transaction receipt from enqueuing
 */
async function signAndEnqueueSafeTransaction(
	walletProvider: JsonRpcApiProvider,
	transaction: FullSafeTransaction,
) {
	// Switch to Safe's chain for signing
	await switchToChain(walletProvider, transaction.chainId);
	const signer = await walletProvider.getSigner();
	const signature = await signSafeTransaction(signer, transaction);

	const currentSettings = await loadCurrentSettings();
	// If a bundler URL is set we will use that to relay the transaction
	if (currentSettings.bundlerUrl) {
		console.log("Use Bundler");
		const bundlerProvider = new JsonRpcProvider(currentSettings.bundlerUrl);
		const rpcUrl =
			currentSettings.rpcUrl || (await getRpcUrlByChainId(HARBOUR_CHAIN_ID));
		const harbourProvider = new JsonRpcProvider(rpcUrl);
		const harbour = harbourAt(currentSettings.harbourAddress, harbourProvider);
		const gasFee = await getUserOpGasPrice(harbourProvider);
		const { userOp, entryPoint } = await buildUserOp(
			bundlerProvider,
			harbour,
			signer,
			transaction,
			signature,
			gasFee,
		);
		console.log({ userOp });
		const hash = await bundlerProvider.send("eth_sendUserOperation", [
			userOp,
			entryPoint,
		]);
		return { hash, transactionHash: hash };
	}
	// Transaction cannot be relayed. User has to submit the transaction
	// Switch to Harbour chain for enqueuing
	await switchToChain(walletProvider, await getChainId(currentSettings));
	const receipt = await enqueueSafeTransaction(
		signer,
		transaction,
		signature,
		currentSettings.harbourAddress,
	);
	return receipt;
}

export {
	HARBOUR_CHAIN_ID,
	enqueueSafeTransaction,
	harbourAt,
	getHarbourChainId,
	fetchSafeQueue,
	signAndEnqueueSafeTransaction,
};
