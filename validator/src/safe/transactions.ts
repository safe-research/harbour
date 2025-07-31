import { type Address, type Hex, hashTypedData, zeroAddress } from "viem";
import { SAFE_TX_TYPE } from "../safe/constants";
import type { SafeTransactionWithDomain } from "../safe/types";

/**
 * Signs a Safe transaction using EIP-712 typed data
 * @param signer - The ethers.js signer
 * @param transaction - The transaction request parameters
 * @returns The signature string
 */
function getSafeTransactionHash(transaction: SafeTransactionWithDomain): Hex {
	const domain = {
		chainId: BigInt(transaction.chainId),
		verifyingContract: transaction.safe,
	};

	const message = {
		to: transaction.to,
		value: transaction.value,
		data: transaction.data,
		operation: transaction.operation,
		safeTxGas: transaction.safeTxGas,
		baseGas: transaction.baseGas,
		gasPrice: transaction.gasPrice,
		gasToken: transaction.gasToken,
		refundReceiver: transaction.refundReceiver,
		nonce: transaction.nonce,
	};

	return hashTypedData({
		domain,
		types: SAFE_TX_TYPE,
		primaryType: "SafeTx",
		message,
	});
}

/**
 * Creates a FullSafeTransaction with sensible defaults.
 * @param params - Transaction parameters with required fields and optional overrides.
 * @returns A FullSafeTransaction object.
 */
function getSafeTransaction(params: {
	chainId: bigint;
	safe: Address;
	to: Address;
	value?: bigint;
	data?: Hex;
	nonce?: bigint;
	operation?: number;
	safeTxGas?: bigint;
	baseGas?: bigint;
	gasPrice?: bigint;
	gasToken?: Address;
	refundReceiver?: Address;
}): SafeTransactionWithDomain {
	return {
		chainId: params.chainId,
		safe: params.safe,
		to: params.to,
		value: params.value ?? 0n,
		data: params.data ?? "0x",
		nonce: params.nonce ?? 0n,
		operation: params.operation ?? 0, // CALL
		safeTxGas: params.safeTxGas ?? 0n,
		baseGas: params.baseGas ?? 0n,
		gasPrice: params.gasPrice ?? 0n,
		gasToken: params.gasToken ?? zeroAddress,
		refundReceiver: params.refundReceiver ?? zeroAddress,
	};
}

export { getSafeTransaction, getSafeTransactionHash };
