import type { JsonRpcSigner } from "ethers";
import { ethers } from "ethers";
import { bytes32ToAddress, compactSignatureToFullSignature } from "./encoding";
import { aggregateMulticall } from "./multicall";
import type {
	FullSafeTransaction,
	HarbourSignature,
	HarbourTransactionDetails,
} from "./types";

/**
 * Interface representing the configuration of a Safe contract.
 */
interface SafeConfiguration {
	/** List of owner addresses. */
	owners: string[];
	/** The number of required confirmations (threshold) as a string. */
	threshold: number;
	/** The address of the fallback handler contract. */
	fallbackHandler: string;
	/** The current nonce of the Safe, as a string. */
	nonce: string;
	/** List of enabled module addresses. */
	modules: string[];
	/** The address of the guard contract, if any. */
	guard: string;
	/** The address of the Safe singleton (mastercopy) contract. */
	singleton: string;
}

const SAFE_ABI = [
	"function getOwners() view returns (address[])",
	"function getThreshold() view returns (uint256)",
	"function nonce() view returns (uint256)",
	"function getModulesPaginated(address start, uint256 pageSize) view returns (address[] modules, address next)",
	"function getStorageAt(uint256 offset, uint256 length) view returns (bytes)",
	"function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures)",
];
const SAFE_INTERFACE = new ethers.Interface(SAFE_ABI);

const FALLBACK_SLOT =
	"0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5";
const GUARD_SLOT =
	"0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8";
const SINGLETON_SLOT = ethers.zeroPadBytes(ethers.toBeHex(0), 32);
const SENTINEL = "0x0000000000000000000000000000000000000001";

/**
 * Fetches the configuration of a Safe contract using multicall aggregation.
 * @param provider - The ethers.js JSON-RPC provider.
 * @param safeAddress - The address of the Safe contract.
 * @param options - Optional settings, such as modulePageSize.
 * @returns A promise that resolves to the SafeConfiguration object.
 */
async function getSafeConfiguration(
	provider: ethers.JsonRpcApiProvider,
	safeAddress: string,
	options: { modulePageSize: number } = { modulePageSize: 50 },
): Promise<SafeConfiguration> {
	const calls = [
		{
			target: safeAddress,
			callData: SAFE_INTERFACE.encodeFunctionData("getOwners"),
		},
		{
			target: safeAddress,
			callData: SAFE_INTERFACE.encodeFunctionData("getThreshold"),
		},
		{
			target: safeAddress,
			callData: SAFE_INTERFACE.encodeFunctionData("getStorageAt", [
				FALLBACK_SLOT,
				1,
			]),
		},
		{
			target: safeAddress,
			callData: SAFE_INTERFACE.encodeFunctionData("nonce"),
		},
		{
			target: safeAddress,
			callData: SAFE_INTERFACE.encodeFunctionData("getStorageAt", [
				GUARD_SLOT,
				1,
			]),
		},
		{
			target: safeAddress,
			callData: SAFE_INTERFACE.encodeFunctionData("getStorageAt", [
				SINGLETON_SLOT,
				1,
			]),
		},
		{
			target: safeAddress,
			callData: SAFE_INTERFACE.encodeFunctionData("getModulesPaginated", [
				SENTINEL,
				options.modulePageSize,
			]),
		},
	];
	const results = await aggregateMulticall(provider, calls);
	const configuration: SafeConfiguration = {
		owners: SAFE_INTERFACE.decodeFunctionResult(
			"getOwners",
			results[0].returnData,
		)[0],
		threshold: Number(
			SAFE_INTERFACE.decodeFunctionResult(
				"getThreshold",
				results[1].returnData,
			)[0],
		),
		fallbackHandler: bytes32ToAddress(
			SAFE_INTERFACE.decodeFunctionResult(
				"getStorageAt",
				results[2].returnData,
			)[0],
		),
		nonce: String(
			SAFE_INTERFACE.decodeFunctionResult("nonce", results[3].returnData)[0],
		),
		guard: bytes32ToAddress(
			SAFE_INTERFACE.decodeFunctionResult(
				"getStorageAt",
				results[4].returnData,
			)[0],
		),
		singleton: bytes32ToAddress(
			SAFE_INTERFACE.decodeFunctionResult(
				"getStorageAt",
				results[5].returnData,
			)[0],
		),
		modules: SAFE_INTERFACE.decodeFunctionResult(
			"getModulesPaginated",
			results[6].returnData,
		)[0],
	};

	return configuration;
}

/**
 * Encodes an array of HarbourSignature objects into a single concatenated signature string.
 * The signatures are sorted by signer address before encoding.
 * @param signatures - Array of HarbourSignature objects to encode.
 * @returns The concatenated signature string.
 */
function encodeSignatures(signatures: HarbourSignature[]): string {
	signatures.sort((a, b) => a.signer.localeCompare(b.signer));

	return `0x${signatures.map((signature) => compactSignatureToFullSignature(signature).slice(2)).join("")}`;
}

/**
 * Executes a transaction on the Safe contract.
 * @param provider - The ethers.js JSON-RPC provider.
 * @param safeAddress - The address of the Safe contract.
 * @param transaction - The transaction details, including signatures.
 * @returns A promise that resolves to the transaction response.
 */
async function executeTransaction(
	signer: JsonRpcSigner,
	safeAddress: string,
	transaction: HarbourTransactionDetails & { signatures: HarbourSignature[] },
) {
	const safe = new ethers.Contract(safeAddress, SAFE_ABI, signer);
	const signatureBytes = encodeSignatures(transaction.signatures);

	const tx = await safe.execTransaction(
		transaction.to,
		transaction.value,
		transaction.data,
		transaction.operation,
		transaction.safeTxGas,
		transaction.baseGas,
		transaction.gasPrice,
		transaction.gasToken,
		transaction.refundReceiver,
		signatureBytes,
	);

	return tx;
}
/**
 * Signs a Safe transaction using EIP-712 typed data
 * @param signer - The ethers.js signer
 * @param transaction - The transaction request parameters
 * @returns The signature string
 */
async function signSafeTransaction(
	signer: JsonRpcSigner,
	transaction: FullSafeTransaction,
): Promise<string> {
	const domain = {
		chainId: transaction.chainId,
		verifyingContract: transaction.safeAddress,
	};

	const types = {
		SafeTx: [
			{ name: "to", type: "address" },
			{ name: "value", type: "uint256" },
			{ name: "data", type: "bytes" },
			{ name: "operation", type: "uint8" },
			{ name: "safeTxGas", type: "uint256" },
			{ name: "baseGas", type: "uint256" },
			{ name: "gasPrice", type: "uint256" },
			{ name: "gasToken", type: "address" },
			{ name: "refundReceiver", type: "address" },
			{ name: "nonce", type: "uint256" },
		],
	};

	const message = {
		to: transaction.to,
		value: transaction.value,
		data: transaction.data,
		operation: 0,
		safeTxGas: 0,
		baseGas: 0,
		gasPrice: 0,
		gasToken: ethers.ZeroAddress,
		refundReceiver: ethers.ZeroAddress,
		nonce: transaction.nonce,
	};

	return signer.signTypedData(domain, types, message);
}

/**
 * Creates a FullSafeTransaction with sensible defaults.
 * @param params - Transaction parameters with required fields and optional overrides.
 * @returns A FullSafeTransaction object.
 */
function getSafeTransaction(params: {
	chainId: number;
	safeAddress: string;
	to: string;
	value?: string;
	data?: string;
	nonce?: string;
	operation?: number;
	safeTxGas?: string;
	baseGas?: string;
	gasPrice?: string;
	gasToken?: string;
	refundReceiver?: string;
}): FullSafeTransaction {
	return {
		chainId: params.chainId,
		safeAddress: params.safeAddress,
		to: params.to,
		value: params.value ?? "0",
		data: params.data ?? "0x",
		nonce: params.nonce ?? "0",
		operation: params.operation ?? 0, // CALL
		safeTxGas: params.safeTxGas ?? "0",
		baseGas: params.baseGas ?? "0",
		gasPrice: params.gasPrice ?? "0",
		gasToken: params.gasToken ?? ethers.ZeroAddress,
		refundReceiver: params.refundReceiver ?? ethers.ZeroAddress,
	};
}

export {
	getSafeConfiguration,
	executeTransaction,
	signSafeTransaction,
	getSafeTransaction,
};

export type { SafeConfiguration };
