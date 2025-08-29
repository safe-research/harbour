import {
	Contract,
	type ContractRunner,
	ethers,
	Interface,
	type JsonRpcApiProvider,
	JsonRpcProvider,
	type JsonRpcSigner,
} from "ethers";
import {
	loadCurrentSettings,
	type SettingsFormData,
} from "@/components/settings/SettingsForm";
import {
	decodeContext,
	decodeEncryptionPublicKey,
	type SessionKeys,
} from "@/contexts/SessionContext";
import type { WakuManager } from "@/contexts/WakuContext";
import { buildUserOp, getUserOpGasPrice } from "./bundler";
import { getRpcUrlByChainId, switchToChain } from "./chains";
import { decryptSafeTransaction, encryptSafeTransaction } from "./encryption";
import { aggregateMulticall } from "./multicall";
import {
	getSafeTransactionHash,
	getSafeTransactionStructHash,
	type SafeConfiguration,
	signSafeTransaction,
} from "./safe";
import type {
	ChainId,
	FullSafeTransaction,
	HarbourSignature,
	HarbourTransactionDetails,
} from "./types";

/** The chain ID where the Harbour contract is deployed. */
const HARBOUR_CHAIN_ID = 100n;
/** The address of the Harbour contract. */
const HARBOUR_ADDRESS = "0x7E299130D19bd0F3D86718d389a4DEF957034189";

/** ABI for the Harbour contract. */
const HARBOUR_ABI = [
	"function SUPPORTED_ENTRYPOINT() view returns (address supportedEntrypoint)",
	"function getNonce(address signer) view returns (uint256 userOpNonce)",
	"function storeTransaction(bytes32 safeTxHash, address safeAddress, uint256 chainId, uint256 nonce, address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, address signer, bytes32 r, bytes32 vs) external returns (uint256 listIndex)",
	"function enqueueTransaction(address safeAddress, uint256 chainId, uint256 nonce, address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signature) external",
	"function retrieveSignatures(address signerAddress, address safeAddress, uint256 chainId, uint256 nonce, uint256 start, uint256 count) external view returns (tuple(bytes32 r, bytes32 vs, bytes32 txHash)[] page, uint256 totalCount)",
	"function retrieveTransaction(bytes32 safeTxHash) view returns (tuple(bool stored,uint8 operation,address to,uint128 value,uint128 safeTxGas,uint128 baseGas,uint128 gasPrice,address gasToken,address refundReceiver,bytes data) txParams)",
];

/** ABI for the Secret Harbour contract. */
const SECRET_HARBOUR_ABI = [
	"event SafeTransactionRegistered(bytes32 indexed uid, bytes32 indexed safeTxHash, bytes encryptionBlob)",
	"event SafeTransactionSigned(address indexed signer, bytes32 indexed safeTxHash, bytes signature)",
	"function supportsInterface(bytes4 interfaceId) view returns (bool supported)",
	"function registerEncryptionKey(bytes32 context, bytes32 publicKey)",
	"function registerEncryptionKeyFor(address signer, bytes32 context, bytes32 publicKey, bytes calldata signature)",
	"function enqueueTransaction(uint256 chainId, address safe, uint256 nonce, bytes32 safeTxStructHash, bytes calldata signature, bytes calldata encryptionBlob) returns (bytes32 uid)",
	"function retrieveEncryptionPublicKeys(address[] calldata signers) view returns (bytes32[] publicKeys)",
	"function retrieveEncryptionKey(address signers) view returns (tuple(bytes32 context, bytes32 publicKey) encryptionKey)",
	"function retrieveRegistrations(uint256 chainId, address safe, uint256 nonce, address notary, uint256 start, uint256 count) view returns (tuple(uint256 blockNumber, bytes32 uid)[] page, uint256 totalCount)",
	"function retrieveSignatures(address[] calldata signers, bytes32 safeTxHash) view returns (uint256[] blockNumbers)",
];

const SECRET_HARBOUR_INTERFACE_ID = "0xe18a4e58";

function harbourAt(
	harbourAddress: string | undefined,
	runner?: ContractRunner,
): Contract {
	return new Contract(harbourAddress || HARBOUR_ADDRESS, HARBOUR_ABI, runner);
}

function secretHarbourAt(
	harbourAddress: string,
	runner?: ContractRunner,
): Contract {
	return new Contract(harbourAddress, SECRET_HARBOUR_ABI, runner);
}

async function supportsSecretHarbourInterface(
	harbourAddress: string,
	runner: ContractRunner,
): Promise<boolean> {
	const harbour = secretHarbourAt(harbourAddress, runner);
	try {
		return await harbour.supportsInterface(SECRET_HARBOUR_INTERFACE_ID);
	} catch {
		return false;
	}
}

/** Harbour contract specific settings. */
type HarbourRpcSettings = Pick<Partial<SettingsFormData>, "rpcUrl">;

async function getConfiguredHarbourRpc(settings?: HarbourRpcSettings) {
	const rpcUrl =
		settings?.rpcUrl ?? (await getRpcUrlByChainId(HARBOUR_CHAIN_ID));
	return new JsonRpcProvider(rpcUrl);
}

/** Harbour contract specific settings. */
type HarbourContractSettings = Pick<
	Partial<SettingsFormData>,
	"harbourAddress" | "rpcUrl"
>;

async function getConfiguredSecretHarbour(
	settings?: HarbourContractSettings,
	runner?: ContractRunner,
) {
	const harbourSettings = settings ?? (await loadCurrentSettings()) ?? {};
	const harbourAddress = harbourSettings?.harbourAddress;
	if (!harbourAddress) {
		// The default harbour contract does not support the secret harbour
		// interface, so its not even worth checking.
		return null;
	}

	const harbourRunner =
		runner ?? (await getConfiguredHarbourRpc(harbourSettings));
	const supported = await supportsSecretHarbourInterface(
		harbourAddress,
		harbourRunner,
	);
	if (!supported) {
		return null;
	}

	return secretHarbourAt(harbourAddress, harbourRunner);
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
 * Session keys used for decrypting transactions.
 */
interface SessionDecryptionKey {
	encryption: Pick<SessionKeys["encryption"], "privateKey">;
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
	/** The session keys for decrypting secret harbour transactions. */
	sessionKeys: SessionDecryptionKey | null;
	/** Optional maximum number of nonces to fetch ahead of the current Safe nonce (default: 5). */
	maxNoncesToFetch?: number;
	/** Optional maximum number of transactions to fetch per nonce (default: 100). */
	maxTxsPerNonce?: number;
}

/**
 * Fetches the queue of transactions for a given Safe from the Harbour contract.
 * It retrieves transactions for multiple nonces starting from the Safe's current nonce,
 * collects their signatures, and groups them.
 *
 * @param {FetchSafeQueueParams} params - Parameters for fetching the queue.
 * @returns {Promise<NonceGroup[]>} A promise that resolves to an array of nonce groups, each containing transactions and their signatures.
 */
async function fetchSafeQueue(
	params: FetchSafeQueueParams,
): Promise<NonceGroup[]> {
	const currentSettings = await loadCurrentSettings();
	const harbourAddress = currentSettings?.harbourAddress || HARBOUR_ADDRESS;
	const { provider } = params;

	if (await supportsSecretHarbourInterface(harbourAddress, provider)) {
		return fetchSecretHarbourSafeQueue(harbourAddress, params);
	}
	return fetchHarbourSafeQueue(harbourAddress, params);
}

async function fetchHarbourSafeQueue(
	harbourAddress: string,
	{
		provider,
		safeAddress,
		safeConfig,
		safeChainId,
		maxNoncesToFetch = 5,
		maxTxsPerNonce = 100,
	}: FetchSafeQueueParams,
): Promise<NonceGroup[]> {
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
					maxTxsPerNonce,
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

async function fetchSecretHarbourSafeQueue(
	harbourAddress: string,
	{
		provider,
		safeAddress,
		safeConfig,
		safeChainId,
		sessionKeys,
		maxNoncesToFetch = 5,
		maxTxsPerNonce = 100,
	}: FetchSafeQueueParams,
): Promise<NonceGroup[]> {
	if (!sessionKeys) {
		// No decription keys, no transactions!
		return [];
	}

	const secretHarbour = secretHarbourAt(harbourAddress, provider);
	const startNonce = Number(safeConfig.nonce);
	const owners = safeConfig.owners || [];

	// Batch retrieve encryption key calls
	const keyCalls: Array<{
		target: string;
		allowFailure: boolean;
		callData: string;
	}> = [];
	const keyMeta: Array<{ owner: string }> = [];

	for (const owner of owners) {
		keyCalls.push({
			target: harbourAddress,
			allowFailure: false,
			callData: secretHarbour.interface.encodeFunctionData(
				"retrieveEncryptionKey",
				[owner],
			),
		});
		keyMeta.push({ owner });
	}

	const keyResults = await aggregateMulticall(provider, keyCalls);
	const notaries = keyResults
		.map((res, i) => {
			const { owner } = keyMeta[i];
			const [[context]] = secretHarbour.interface.decodeFunctionResult(
				"retrieveEncryptionKey",
				res.returnData,
			);
			const { relayer } = decodeContext(ethers.getBytes(context));
			return { owner, notary: relayer };
		})
		.filter(({ notary }) => notary !== ethers.ZeroAddress);

	// Batch retrieve transaction registration calls
	const txCalls: Array<{
		target: string;
		allowFailure: boolean;
		callData: string;
	}> = [];
	const txMeta: Array<{ nonce: number }> = [];

	for (let i = 0; i < maxNoncesToFetch; i++) {
		const nonce = startNonce + i;
		for (const { notary } of notaries) {
			txCalls.push({
				target: harbourAddress,
				allowFailure: false,
				callData: secretHarbour.interface.encodeFunctionData(
					"retrieveRegistrations",
					[safeChainId, safeAddress, nonce, notary, 0, maxTxsPerNonce],
				),
			});
			txMeta.push({ nonce });
		}
	}

	const txResults = await aggregateMulticall(provider, txCalls);
	const txRegistrations = [...txResults].flatMap((res, i) => {
		const { nonce } = txMeta[i];
		const [page] = secretHarbour.interface.decodeFunctionResult(
			"retrieveRegistrations",
			res.returnData,
		);
		return page.map(([blockNumber, uid]: [string, string]) => ({
			nonce,
			blockNumber,
			uid,
		}));
	});

	// Retrieve transaction data from events.
	const details = (await Promise.all(
		txRegistrations.map(({ blockNumber, uid }) =>
			secretHarbour.queryFilter(
				secretHarbour.filters.SafeTransactionRegistered(uid),
				Number(blockNumber),
				Number(blockNumber),
			),
		),
	)) as ethers.EventLog[][];

	const decryptedTransactions = await Promise.all(
		details.map(async (logs, i) => {
			try {
				const [{ args }] = logs;
				const { safeTxHash, encryptionBlob } = args;
				const { nonce } = txRegistrations[i];
				const transaction = await decryptSafeTransaction(
					encryptionBlob,
					sessionKeys.encryption.privateKey,
				);
				return [{ nonce, safeTxHash, transaction }];
			} catch {
				return [];
			}
		}),
	);

	// Clients MUST verify transaction hashes for decrypted Safe transactions.
	const verifiedTransactions = decryptedTransactions.flat().filter(
		({ nonce, safeTxHash, transaction }) =>
			safeTxHash ===
			getSafeTransactionHash({
				...transaction,
				chainId: safeChainId,
				safeAddress,
				nonce,
			}),
	);

	// De-duplicate transactions, which may happen if a key was rotated and the
	// same transaction was submitted more than once.
	const uniqueTransactions = [
		...new Map(
			verifiedTransactions.map((tx) => [tx.safeTxHash, tx] as const),
		).values(),
	];

	// Batch retrieve signature registration calls
	const sigCalls: Array<{
		target: string;
		allowFailure: boolean;
		callData: string;
	}> = [];

	for (const { safeTxHash } of uniqueTransactions) {
		sigCalls.push({
			target: harbourAddress,
			allowFailure: false,
			callData: secretHarbour.interface.encodeFunctionData(
				"retrieveSignatures",
				[owners, safeTxHash],
			),
		});
	}

	const sigResults = await aggregateMulticall(provider, sigCalls);
	const sigRegistrations = [...sigResults]
		.flatMap((res, i) => {
			const { safeTxHash } = uniqueTransactions[i];
			const [blockNumbers] = secretHarbour.interface.decodeFunctionResult(
				"retrieveSignatures",
				res.returnData,
			) as unknown as [bigint[]];
			return blockNumbers.map((blockNumber, i) => ({
				blockNumber,
				signer: owners[i],
				safeTxHash,
			}));
		})
		.filter(({ blockNumber }) => blockNumber !== 0n);

	// Retrieve signature data from events.
	const signatureData = (await Promise.all(
		sigRegistrations.map(({ blockNumber, signer, safeTxHash }) =>
			secretHarbour.queryFilter(
				secretHarbour.filters.SafeTransactionSigned(signer, safeTxHash),
				Number(blockNumber),
				Number(blockNumber),
			),
		),
	)) as ethers.EventLog[][];

	const signatures: Record<string, Array<HarbourSignature> | undefined> = {};
	for (const logs of signatureData) {
		const [{ args }] = logs;
		const { signer, safeTxHash, signature } = args;
		const { r, yParityAndS } = ethers.Signature.from(signature);
		signatures[safeTxHash] = signatures[safeTxHash] ?? [];
		signatures[safeTxHash].push({
			r,
			vs: yParityAndS,
			txHash: safeTxHash,
			signer,
		});
	}

	// Compute the nonce groups for the retrieved transactions.
	const groups: Record<string, NonceGroup> = {};
	for (const { nonce, safeTxHash, transaction } of uniqueTransactions) {
		groups[nonce] = groups[nonce] ?? { nonce, transactions: [] };
		groups[nonce].transactions.push({
			details: {
				...transaction,
				stored: true,
			},
			signatures: signatures[safeTxHash] ?? [],
			safeTxHash,
		});
	}

	return Object.values(groups);
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
 * Secret Harbour encrypted queue parameters.
 */
type EncryptedQueueParams =
	| {
			operation: "encrypt-and-sign";
			sessionKeys: SessionKeys;
			recipientPublicKeys: CryptoKey[];
	  }
	| {
			operation: "sign-only";
			sessionKeys: Pick<SessionKeys, "relayer">;
	  };

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
 * @param waku - The Waku manager
 * @param encryption - The Secret Harbour encrypted queue paramters
 * @returns The transaction receipt from enqueuing
 */
async function signAndEnqueueSafeTransaction(
	walletProvider: JsonRpcApiProvider,
	transaction: FullSafeTransaction,
	waku: WakuManager,
	encryptedQueue: EncryptedQueueParams | null,
) {
	// Switch to Safe's chain for signing
	await switchToChain(walletProvider, transaction.chainId);
	const signer = await walletProvider.getSigner();
	const signature = await signSafeTransaction(signer, transaction);

	const currentSettings = await loadCurrentSettings();
	// If a bundler URL is set we will use that to relay the transaction
	if (waku.isAvailable()) {
		console.log("Use Waku");
		if (await waku.send(transaction, signature)) {
			return { hash: "", transactionHash: "" };
		}
	}

	const rpcUrl =
		currentSettings.rpcUrl ?? (await getRpcUrlByChainId(HARBOUR_CHAIN_ID));
	const harbourProvider = new JsonRpcProvider(rpcUrl);

	// TODO: deprecate this
	if (currentSettings.bundlerUrl) {
		console.log("Use Bundler");
		const bundlerProvider = new JsonRpcProvider(currentSettings.bundlerUrl);
		const harbour = harbourAt(currentSettings.harbourAddress, harbourProvider);
		const gasFee = await getUserOpGasPrice(harbourProvider);
		const useValidator = !!currentSettings.validatorUrl;
		const { userOp, entryPoint } = await buildUserOp(
			bundlerProvider,
			harbour,
			signer,
			transaction,
			signature,
			gasFee,
			useValidator,
		);
		if (useValidator) {
			console.log("Use Validator");
			const response = await fetch(`${currentSettings.validatorUrl}/validate`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(userOp),
			});
			const validatedUserOp: { paymasterAndData: string; signature: string } =
				await response.json();
			userOp.paymasterData = `0x${validatedUserOp.paymasterAndData.slice(106)}`;
			userOp.signature = validatedUserOp.signature;
		}
		console.log({ userOp });
		const hash = await bundlerProvider.send("eth_sendUserOperation", [
			userOp,
			entryPoint,
		]);
		return { hash, transactionHash: hash };
	}

	// If we have encrypted queue configuration and harbour supports it,
	// submit it with our session relayer EOA.
	if (
		encryptedQueue &&
		currentSettings.harbourAddress &&
		(await supportsSecretHarbourInterface(
			currentSettings.harbourAddress,
			harbourProvider,
		))
	) {
		console.log("Use Encrypted Queue");
		const relayer = encryptedQueue.sessionKeys.relayer.connect(harbourProvider);
		const secretHarbour = secretHarbourAt(
			currentSettings.harbourAddress,
			relayer,
		);
		const receipt = await encryptAndEnqueueSafeTransaction(
			secretHarbour,
			transaction,
			signature,
			encryptedQueue,
		);
		return receipt;
	}

	// Transaction cannot be relayed. User has to submit the transaction
	// Switch to Harbour chain for enqueuing
	console.log("Use Manual Submission");
	await switchToChain(walletProvider, await getChainId(currentSettings));
	const receipt = await enqueueSafeTransaction(
		signer,
		transaction,
		signature,
		currentSettings.harbourAddress,
	);
	return receipt;
}

async function encryptAndEnqueueSafeTransaction(
	secretHarbour: Contract,
	transaction: FullSafeTransaction,
	signature: string,
	encryptedQueue: EncryptedQueueParams,
) {
	const transactionHash = getSafeTransactionStructHash(transaction);
	// As a gas optimization, we do not re-publish the encryption blob in the
	// case that an already registered transaction is being signed.
	const encryptionBlob =
		encryptedQueue.operation === "encrypt-and-sign"
			? await encryptSafeTransaction(
					transaction,
					encryptedQueue.sessionKeys.encryption,
					encryptedQueue.recipientPublicKeys,
				)
			: "0x";
	const enqueue = await secretHarbour.enqueueTransaction(
		transaction.chainId,
		transaction.safeAddress,
		transaction.nonce,
		transactionHash,
		signature,
		encryptionBlob,
	);
	return await enqueue.wait();
}

/**
 * Parameters for the fetchEncryptionPublicKeys function.
 */
interface FetchEncryptionPublicKeysParams {
	/** Partial Safe configuration, specifically needing the owners. */
	safeConfig: Pick<SafeConfiguration, "owners">;
}

/**
 * Fetches encryption key and context for the specified account.
 */
async function fetchEncryptionKey(
	address: string,
	settings?: HarbourContractSettings,
): Promise<{ context: string; publicKey: string } | null> {
	const secretHarbour = await getConfiguredSecretHarbour(settings);
	if (!secretHarbour) {
		return null;
	}
	const [context, publicKey] =
		await secretHarbour.retrieveEncryptionKey(address);
	return { context, publicKey };
}

/**
 * Fetches public encryption keys for a Safe owner. Returns `null` if the
 * currently configured Harbour contract does not support encryption.
 */
async function fetchEncryptionPublicKeys({
	safeConfig: { owners },
}: FetchEncryptionPublicKeysParams): Promise<Record<
	string,
	CryptoKey | undefined
> | null> {
	const secretHarbour = await getConfiguredSecretHarbour();
	if (!secretHarbour) {
		return null;
	}

	const publicKeys = await secretHarbour.retrieveEncryptionPublicKeys([
		...owners,
	]);
	const ownerPublicKeys = await Promise.all(
		(publicKeys as string[]).map(
			async (publicKey, i) =>
				[owners[i], await decodeEncryptionPublicKey(publicKey)] as const,
		),
	);
	return Object.fromEntries(
		ownerPublicKeys.filter(([, publicKey]) => publicKey) as [
			string,
			CryptoKey,
		][],
	);
}

export type {
	EncryptedQueueParams,
	HarbourContractSettings,
	SessionDecryptionKey,
};
export {
	HARBOUR_CHAIN_ID,
	enqueueSafeTransaction,
	harbourAt,
	secretHarbourAt,
	supportsSecretHarbourInterface,
	getConfiguredHarbourRpc,
	getConfiguredSecretHarbour,
	getHarbourChainId,
	fetchSafeQueue,
	signAndEnqueueSafeTransaction,
	fetchEncryptionPublicKeys,
	fetchEncryptionKey,
};
