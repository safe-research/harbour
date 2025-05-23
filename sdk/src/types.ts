/**
 * Represents a blockchain identifier.
 */
export type ChainId = number;

/**
 * Details of a transaction stored in Harbour.
 */
export interface SDKTransactionDetails {
	/** The destination address of the transaction. */
	to: string;
	/** The value to be transferred in the transaction (BigNumberish string). */
	value: string;
	/** The data payload for the transaction (bytes). */
	data: string;
	/** The operation type for the transaction. */
	operation: number;
	/** Indicates whether the transaction is stored. */
	stored: boolean;
	/** The gas limit for the Safe transaction (BigNumberish string). */
	safeTxGas: string;
	/** The base gas for the transaction (BigNumberish string). */
	baseGas: string;
	/** The gas price for the transaction (BigNumberish string). */
	gasPrice: string;
	/** The address of the gas token. */
	gasToken: string;
	/** The address of the refund receiver. */
	refundReceiver: string;
}

/**
 * Represents a signature collected by Harbour.
 */
export interface SDKHarbourSignature {
	/** The r value of the signature (bytes32). */
	r: string;
	/** The vs value of the signature (bytes32). */
	vs: string;
	/** The transaction hash (bytes32). */
	txHash: string;
	/** The address of the signer. */
	signer: string;
}

/**
 * Represents the full parameters needed to enqueue a Safe transaction.
 */
export interface SDKFullSafeTransaction {
	/** The address of the Safe. */
	safeAddress: string;
	/** The chain ID of the Safe network. */
	chainId: ChainId;
	/** The nonce of the Safe transaction (BigNumberish string). */
	nonce: string;
	/** The destination address of the transaction. */
	to: string;
	/** The value to be transferred in the transaction (BigNumberish string). */
	value: string;
	/** The data payload for the transaction (bytes). */
	data: string;
	/** The operation type for the transaction. */
	operation: number;
	/** The gas limit for the Safe transaction (BigNumberish string). */
	safeTxGas: string;
	/** The base gas for the transaction (BigNumberish string). */
	baseGas: string;
	/** The gas price for the transaction (BigNumberish string). */
	gasPrice: string;
	/** The address of the gas token. */
	gasToken: string;
	/** The address of the refund receiver. */
	refundReceiver: string;
}
