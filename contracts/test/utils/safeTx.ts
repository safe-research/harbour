import { type BytesLike, ethers, type Signer } from "ethers";

enum Operation {
	CALL = 0,
	DELEGATECALL = 1,
}

type SafeTransaction = {
	to: string;
	value: bigint;
	data: string;
	operation: number;
	safeTxGas: bigint;
	baseGas: bigint;
	gasPrice: bigint;
	gasToken: string;
	refundReceiver: string;
	nonce: bigint;
};

const EIP712_SAFE_TX_TYPE = {
	// "SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)"
	SafeTx: [
		{ type: "address", name: "to" },
		{ type: "uint256", name: "value" },
		{ type: "bytes", name: "data" },
		{ type: "uint8", name: "operation" },
		{ type: "uint256", name: "safeTxGas" },
		{ type: "uint256", name: "baseGas" },
		{ type: "uint256", name: "gasPrice" },
		{ type: "address", name: "gasToken" },
		{ type: "address", name: "refundReceiver" },
		{ type: "uint256", name: "nonce" },
	],
};

/**
 * @param safeTransaction - The safe transaction to hash
 * @param chainId - The chain id of the transaction
 * @param safeAddress - The address of the safe
 * @returns The hash of the safe transaction
 */
function getSafeTransactionHash(safeAddress: string, chainId: bigint, safeTransaction: SafeTransaction) {
	return ethers.TypedDataEncoder.hash(
		{ chainId, verifyingContract: safeAddress },
		EIP712_SAFE_TX_TYPE,
		safeTransaction,
	);
}

/**
 * @param safeTx - The safe transaction to hash
 * @returns The EIP-712 struct-hash of the safe transaction
 */
function getSafeTransactionStructHash(safeTransaction: SafeTransaction) {
	return ethers.TypedDataEncoder.hashStruct("SafeTx", EIP712_SAFE_TX_TYPE, safeTransaction);
}

/**
 * @param partialSafeTx - The partial Safe transaction to populate
 * @returns The fully populated Safe transaction with default values for the unspecfied fields
 */
function populateSafeTransaction(partialSafeTx: Partial<SafeTransaction>): SafeTransaction {
	return {
		to: ethers.ZeroAddress,
		value: 0n,
		data: "0x",
		operation: Operation.CALL,
		safeTxGas: 0n,
		baseGas: 0n,
		gasPrice: 0n,
		gasToken: ethers.ZeroAddress,
		refundReceiver: ethers.ZeroAddress,
		nonce: 0n,
		...partialSafeTx,
	};
}

/**
 * @param signer - The EOA to sign a Safe transaction with
 * @param safeTx - the Safe transaction to sign
 * @returns The ECDSA signature for the Safe transaction
 */
async function signSafeTransaction(
	signer: Pick<Signer, "signTypedData">,
	safe: string,
	chainId: bigint,
	safeTx: SafeTransaction,
): Promise<string> {
	return signer.signTypedData({ chainId, verifyingContract: safe }, EIP712_SAFE_TX_TYPE, safeTx);
}

/**
 * @param safeTx - The Safe transaction to encode
 * @returns The RLP encoded Safe transaction
 */
function rlpEncodeSafeTransaction(safeTx: SafeTransaction): string {
	const n = ethers.toBeArray;
	return ethers.encodeRlp([
		safeTx.to,
		n(safeTx.value),
		safeTx.data,
		n(safeTx.operation),
		n(safeTx.safeTxGas),
		n(safeTx.baseGas),
		n(safeTx.gasPrice),
		safeTx.gasToken,
		safeTx.refundReceiver,
		n(safeTx.nonce),
	]);
}

/**
 * @param data - The RLP data to decode
 * @returns The decoded Safe transaction
 */
function rlpDecodeSafeTransaction(data: BytesLike): SafeTransaction {
	const decoded = ethers.decodeRlp(data);
	if (!Array.isArray(decoded) || decoded.length !== 10 || decoded.some((field) => typeof field !== "string")) {
		throw new Error("invalid Safe transaction RLP encoding");
	}
	const fields = decoded as string[];

	const a = ethers.getAddress;
	const n = (field: string) => (field === "0x" ? 0n : BigInt(ethers.toBeHex(field, 32)));
	const o = (field: string) => {
		const value = n(field);
		if (value === 0n) {
			return Operation.CALL;
		}
		if (value === 1n) {
			return Operation.DELEGATECALL;
		}
		throw new Error(`invalid Safe operation ${BigInt(field)}`);
	};

	return {
		to: a(fields[0]),
		value: n(fields[1]),
		data: fields[2],
		operation: o(fields[3]),
		safeTxGas: n(fields[4]),
		baseGas: n(fields[5]),
		gasPrice: n(fields[6]),
		gasToken: a(fields[7]),
		refundReceiver: a(fields[8]),
		nonce: n(fields[9]),
	};
}

export type { SafeTransaction };
export {
	Operation,
	EIP712_SAFE_TX_TYPE,
	getSafeTransactionHash,
	getSafeTransactionStructHash,
	populateSafeTransaction,
	signSafeTransaction,
	rlpEncodeSafeTransaction,
	rlpDecodeSafeTransaction,
};
