import type { Address, Hex, Signature } from "viem";

export type MetaTransaction = {
	/** The recipient address of the transaction. */
	to: Address;
	/** The amount of ETH/native currency to send (in wei, as a string). */
	value: bigint;
	/** The transaction data (calldata). */
	data: Hex;
};

/**
 * Interface representing the core parameters of a Safe transaction.
 */
export type SafeTransaction = MetaTransaction & {
	/** The type of operation (call or delegatecall). */
	operation: number;
	/** The amount of gas allocated for the Safe transaction execution. */
	safeTxGas: bigint;
	/** The base gas cost for the transaction (e.g., for data). */
	baseGas: bigint;
	/** The price of gas for the transaction (in wei, as a string). */
	gasPrice: bigint;
	/** The address of the token used for gas payments (address(0) for native currency). */
	gasToken: Address;
	/** The address to receive any refund from gas payments. */
	refundReceiver: Address;
	/** The nonce of the Safe transaction. */
	nonce: bigint;
};

export type SafeTransactionWithDomain = SafeTransaction & {
	/** The chain ID where the transaction is intended to be executed. */
	chainId: bigint;
	/** The address of the Safe contract. */
	safe: Address;
};

/**
 * Interface representing a complete Safe transaction, including nonce, chainId, and Safe address.
 */
export type SignedSafeTransaction = SafeTransactionWithDomain & {
	signature: Signature;
};

export type SafeConfiguration = {
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
};
