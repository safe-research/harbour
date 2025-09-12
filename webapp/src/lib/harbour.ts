import {
	Contract,
	type ContractRunner,
	ethers,
	type JsonRpcApiProvider,
	JsonRpcProvider,
	type JsonRpcSigner,
} from "ethers";
import {
	loadCurrentSettings,
	type SettingsFormData,
} from "@/components/settings/SettingsForm";
import type { SessionKeys } from "@/contexts/SessionContext";
import type { WakuManager } from "@/contexts/WakuContext";
import { buildUserOp, getUserOpGasPrice } from "./bundler";
import { getRpcUrlByChainId, switchToChain } from "./chains";
import {
	decryptSafeTransaction,
	encryptSafeTransaction,
	importPublicKey,
} from "./encryption";
import { aggregateMulticall } from "./multicall";
import {
	getSafeTransactionHash,
	getSafeTransactionStructHash,
	type SafeConfiguration,
	signSafeTransaction,
} from "./safe";
import { decodeTrustedNotary } from "./session";
import type {
	ChainId,
	FullSafeTransaction,
	HarbourSignature,
	HarbourTransactionDetails,
} from "./types";

/** The chain ID where the Harbour contract is deployed. */
const HARBOUR_CHAIN_ID = 100n;
/** The address of the default Harbour contract. */
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

function harbourAt(
	address: string | undefined,
	runner?: ContractRunner,
): Contract {
	return new Contract(address || HARBOUR_ADDRESS, HARBOUR_ABI, runner);
}

/** The address of the default Secret Harbour contract. */
const SECRET_HARBOUR_ADDRESS = "0x2F150e90Ec1d33A3D939bcF4ED80108ACd47995b";
/** The ERC-165 interface ID for Secret Harbour. */
const SECRET_HARBOUR_INTERFACE_ID = "0xe030e473";

/** ABI for the Secret Harbour contract. */
const SECRET_HARBOUR_ABI = [
	"event SafeTransactionRegistered(bytes32 indexed uid, bytes32 indexed safeTxHash, bytes encryptionBlob)",
	"event SafeTransactionSigned(address indexed signer, bytes32 indexed safeTxHash, bytes signature)",
	"function supportsInterface(bytes4 interfaceId) view returns (bool supported)",
	"function registerEncryptionKey(bytes32 context, bytes32 publicKey)",
	"function registerEncryptionKeyFor(address signer, bytes32 context, bytes32 publicKey, uint256 nonce, uint256 deadline, bytes calldata signature)",
	"function enqueueTransaction(uint256 chainId, address safe, uint256 nonce, bytes32 safeTxStructHash, bytes calldata signature, bytes calldata encryptionBlob) returns (bytes32 uid)",
	"function retrieveEncryptionPublicKeys(address[] calldata signers) view returns (bytes32[] publicKeys)",
	"function retrieveEncryptionKey(address signers) view returns (tuple(bytes32 context, bytes32 publicKey) encryptionKey)",
	"function retrieveEncryptionKeyRegistrationNonce(address signers) view returns (uint256 nonce)",
	"function retrieveTransactions(uint256 chainId, address safe, uint256 nonce, address notary, uint256 start, uint256 count) view returns (tuple(uint256 blockNumber, bytes32 uid)[] page, uint256 totalCount)",
	"function retrieveSignatures(address[] calldata signers, bytes32 safeTxHash) view returns (uint256[] blockNumbers)",
];

function secretHarbourAt(
	address: string | undefined,
	runner?: ContractRunner,
): Contract {
	return new Contract(
		address ?? SECRET_HARBOUR_ADDRESS,
		SECRET_HARBOUR_ABI,
		runner,
	);
}

async function supportsSecretHarbourInterface(
	address: string,
	runner: ContractRunner,
): Promise<boolean> {
	const contract = secretHarbourAt(address, runner);
	try {
		return await contract.supportsInterface(SECRET_HARBOUR_INTERFACE_ID);
	} catch {
		return false;
	}
}

/** Harbour contract specific settings. */
type HarbourContractSettings = Pick<
	Partial<SettingsFormData>,
	"harbourAddress" | "rpcUrl"
>;

/**
 * Gets the currently configured harbour contract.
 */
async function getHarbourContract(
	settings?: HarbourContractSettings,
	runner?: ContractRunner,
): Promise<
	| { type: "international"; international: Contract }
	| { type: "secret"; secret: Contract }
> {
	const harbourSettings = settings ?? (await loadCurrentSettings()) ?? {};
	const harbourAddress = harbourSettings?.harbourAddress;
	const harbourRunner =
		runner ??
		new JsonRpcProvider(
			harbourSettings?.rpcUrl ?? (await getRpcUrlByChainId(HARBOUR_CHAIN_ID)),
		);

	if (
		harbourAddress &&
		(await supportsSecretHarbourInterface(harbourAddress, harbourRunner))
	) {
		return {
			type: "secret",
			secret: secretHarbourAt(harbourAddress, harbourRunner),
		};
	}
	return {
		type: "international",
		international: harbourAt(harbourAddress, harbourRunner),
	};
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
	settings?: HarbourContractSettings,
) {
	const harbour = await getHarbourContract(settings, signer);
	if (harbour.type !== "international") {
		throw new Error("Only international harbour supported");
	}

	const tx = await harbour.international.enqueueTransaction(
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
	const harbour = await getHarbourContract(undefined, params.provider);
	if (harbour.type === "secret") {
		return await fetchSecretHarbourSafeQueue(harbour.secret, params);
	}
	return await fetchInternationHarbourSafeQueue(harbour.international, params);
}

async function fetchInternationHarbourSafeQueue(
	internationalHarbour: Contract,
	{
		provider,
		safeAddress,
		safeConfig,
		safeChainId,
		maxNoncesToFetch = 5,
		maxTxsPerNonce = 100,
	}: FetchSafeQueueParams,
) {
	const harbourAddress = await internationalHarbour.getAddress();
	const iface = internationalHarbour.interface;
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
	secretHarbour: Contract,
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
		// No decryption keys, no transactions!
		return [];
	}

	const harbourAddress = await secretHarbour.getAddress();
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
			const notary = decodeTrustedNotary({ context });
			return { owner, notary };
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
					"retrieveTransactions",
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
			"retrieveTransactions",
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
					sessionKeys.encryption,
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

async function getHarbourChainId(
	currentSettings?: Pick<HarbourContractSettings, "rpcUrl">,
): Promise<bigint> {
	const settings = currentSettings ?? (await loadCurrentSettings());
	if (settings.rpcUrl) {
		const provider = new JsonRpcProvider(settings.rpcUrl);
		const network = await provider.getNetwork();
		return network.chainId;
	}
	return HARBOUR_CHAIN_ID;
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
 * @returns The transaction receipt from enqueuing
 */
async function signAndEnqueueSafeTransaction(
	walletProvider: JsonRpcApiProvider,
	transactionRequest: FullSafeTransaction,
	waku: WakuManager,
	encryptedQueue: EncryptedQueueParams | null,
) {
	// When using encrypted harbour and adding a new transaction, try and add
	// some entropy to the transaction so that it isn't guessable. Otherwise an
	// attacker can potentially fairly trivially mine a `safeTxHash` preimage,
	// especially for Safes that tend to do limited set of operations.
	const transaction = { ...transactionRequest };
	if (encryptedQueue?.operation === "encrypt-and-sign") {
		// Safe transactions have a built-in fee payment mechanism, which is
		// controlled on-or-off by the `gasPrice` parameter. That is, if
		// `gasPrice == 0`, then the fee payment logic is disabled, and there
		// are three additional gas-related properties (`baseGas`, `gasToken`
		// and `refundReceiver`) that have no effect on the actual Safe
		// transaction execution when the fee payment logic is disabled, which
		// we can use to inject some entropy to make the transaction unfeasible
		// to guess. We chose `gasToken` as it is the least error prone (if we
		// incorrectly overwrite this field, then the relayer will be at a loss,
		// as no tokens will be transferred, and not the account itself).
		if (
			BigInt(transaction.gasPrice) === 0n &&
			transaction.gasToken === ethers.ZeroAddress
		) {
			transaction.gasToken = ethers.getAddress(
				ethers.hexlify(ethers.randomBytes(20)),
			);
		}
	}

	// Switch to Safe's chain for signing
	await switchToChain(walletProvider, transaction.chainId);
	const signer = await walletProvider.getSigner();
	const signature = await signSafeTransaction(signer, transaction);

	const currentSettings = await loadCurrentSettings();
	const harbour = await getHarbourContract(currentSettings);

	// Use Waku to broadcast a transaction to the Harbour validator network if
	// available.
	if (waku.isAvailable()) {
		console.log("Use Waku");
		if (await waku.send(transaction, signature)) {
			return { hash: "", transactionHash: "" };
		}
	}

	// If a bundler URL is set we will use that to relay the transaction
	// TODO: deprecate this
	if (currentSettings.bundlerUrl) {
		console.log("Use Bundler");
		if (harbour.type !== "international") {
			throw new Error("Only international harbour supported with ERC-4337");
		}
		const harbourProvider = harbour.international.runner as JsonRpcProvider;
		const bundlerProvider = new JsonRpcProvider(currentSettings.bundlerUrl);
		const gasFee = await getUserOpGasPrice(harbourProvider);
		const useValidator = !!currentSettings.validatorUrl;
		const { userOp, entryPoint } = await buildUserOp(
			bundlerProvider,
			harbour.international,
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

	// If we are configured to use encryption, submit the transaction to Secret
	// Harbour.
	if (harbour.type === "secret") {
		console.log("Use Secret Harbour");
		if (!encryptedQueue) {
			throw new Error("Secret Harbour missing encrypted queue parameters");
		}
		const harbourProvider = harbour.secret.runner as JsonRpcProvider;
		const relayer = encryptedQueue.sessionKeys.relayer.connect(harbourProvider);
		const receipt = await encryptAndEnqueueSafeTransaction(
			harbour.secret.connect(relayer) as Contract,
			transaction,
			signature,
			encryptedQueue,
		);
		return receipt;
	}

	// Transaction cannot be relayed. User has to submit the transaction
	// Switch to Harbour chain for enqueuing
	await switchToChain(walletProvider, await getHarbourChainId(currentSettings));
	const receipt = await enqueueSafeTransaction(
		signer,
		transaction,
		signature,
		currentSettings,
	);
	return receipt;
}

/**
 * Encrypt and enqueue a Safe transaction to Secret Harbour.
 */
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
 * Returns whether or not encryption is supported for the current Harbour settings.
 */
async function supportsEncryption(currentSettings?: HarbourContractSettings) {
	const harbour = await getHarbourContract(currentSettings);
	return harbour.type === "secret";
}

/**
 * The encryption key information that is stored onchain with Secret Harbour.
 */
interface EncryptionKey {
	context: string;
	publicKey: string;
}

type FetchedEncryptionKey =
	| { registered: false }
	| ({ registered: true } & EncryptionKey);

/**
 * Fetches encryption key and context for the specified account.
 */
async function fetchEncryptionKey(
	address: string,
	settings?: HarbourContractSettings,
): Promise<FetchedEncryptionKey | null> {
	const harbour = await getHarbourContract(settings);
	if (harbour.type !== "secret") {
		return null;
	}

	const [context, publicKey] =
		await harbour.secret.retrieveEncryptionKey(address);

	if (context !== ethers.ZeroHash && publicKey !== ethers.ZeroHash) {
		return { registered: true, context, publicKey };
	}
	return { registered: false };
}

/**
 * An encryption key registration request.
 */
interface EncryptionKeyRegistrationRequest extends EncryptionKey {
	harbourChainId?: bigint;
	nonce?: bigint;
	deadline?: bigint;
}

interface SignAndRegisterEncryptionKeyParams {
	walletProvider: JsonRpcApiProvider;
	registration: EncryptionKeyRegistrationRequest;
	sessionKeys: Pick<SessionKeys, "relayer">;
	currentSettings?: HarbourContractSettings;
}

/**
 * Sign an encryption key registration request and submit it onchain.
 */
async function signAndRegisterEncryptionKey({
	walletProvider,
	registration,
	sessionKeys,
	currentSettings,
}: SignAndRegisterEncryptionKeyParams) {
	const harbour = await getHarbourContract(currentSettings);
	if (harbour.type !== "secret") {
		throw new Error("Only Secret Harbour may register encryption keys");
	}

	const signer = await walletProvider.getSigner();
	const signerAddress = await signer.getAddress();
	const harbourChainId =
		registration.harbourChainId ?? (await getHarbourChainId(currentSettings));
	const nonce =
		registration.nonce ??
		(await harbour.secret.retrieveEncryptionKeyRegistrationNonce(
			signerAddress,
		));
	const deadline = registration.deadline ?? Math.ceil(Date.now() / 1000) + 600; // 10 minutes
	const signature = await signer.signTypedData(
		{
			verifyingContract: await harbour.secret.getAddress(),
		},
		{
			EncryptionKeyRegistration: [
				{ name: "context", type: "bytes32" },
				{ name: "publicKey", type: "bytes32" },
				{ name: "harbourChainId", type: "uint256" },
				{ name: "nonce", type: "uint256" },
				{ name: "deadline", type: "uint256" },
			],
		},
		{
			...registration,
			harbourChainId,
			nonce,
			deadline,
		},
	);

	const relayer = sessionKeys.relayer.connect(
		harbour.secret.runner as JsonRpcProvider,
	);
	const transaction = await (
		harbour.secret.connect(relayer) as Contract
	).registerEncryptionKeyFor(
		signerAddress,
		registration.context,
		registration.publicKey,
		nonce,
		deadline,
		signature,
	);
	return await transaction.wait();
}

interface FetchSafeOwnerEncryptionPublicKeysParams {
	safeConfig: Pick<SafeConfiguration, "owners">;
}

type SafeOwnerEncryptionPublicKeys =
	| {
			/** Encryption is disabled for this Harbour configuration */
			enabled: false;
	  }
	| {
			/** Encryption is enabled for this Harbour configuration */
			enabled: true;
			/** The registered public keys of the Safe owners */
			publicKeys: CryptoKey[];
			/** The owners without registered public keys */
			missingRegistrations: string[];
	  };

/**
 * Fetches public encryption keys for a Safe owner. Returns `null` if the
 * currently configured Harbour contract does not support encryption.
 */
async function fetchSafeOwnerEncryptionPublicKeys({
	safeConfig: { owners },
}: FetchSafeOwnerEncryptionPublicKeysParams): Promise<SafeOwnerEncryptionPublicKeys> {
	const harbour = await getHarbourContract();
	if (harbour.type !== "secret") {
		return { enabled: false };
	}

	const rawPublicKeys: string[] =
		await harbour.secret.retrieveEncryptionPublicKeys([...owners]);
	const publicKeys = [];
	const missingRegistrations = [];
	for (const [raw, owner] of rawPublicKeys.map((raw, i) => [raw, owners[i]])) {
		try {
			publicKeys.push(await importPublicKey(raw));
		} catch {
			missingRegistrations.push(owner);
		}
	}
	return { enabled: true, publicKeys, missingRegistrations };
}

export type {
	EncryptionKey,
	EncryptedQueueParams,
	HarbourContractSettings,
	SafeOwnerEncryptionPublicKeys,
};
export {
	HARBOUR_CHAIN_ID,
	HARBOUR_ADDRESS,
	SECRET_HARBOUR_ADDRESS,
	getHarbourChainId,
	fetchSafeQueue,
	supportsEncryption,
	fetchEncryptionKey,
	fetchSafeOwnerEncryptionPublicKeys,
	signAndEnqueueSafeTransaction,
	signAndRegisterEncryptionKey,
};
