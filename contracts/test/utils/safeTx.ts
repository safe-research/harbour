import { ethers } from "ethers";

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

export type { SafeTransaction };
export { getSafeTransactionHash, EIP712_SAFE_TX_TYPE };
