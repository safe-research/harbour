/**
 * Enum representing the type of Safe transaction operation.
 */
enum Operation {
	/** Standard contract call. */
	CALL = 0,
	/** Delegatecall to another contract. */
	DELEGATE = 1,
}

/**
 * Type alias for a blockchain chain ID.
 * Represents the numeric identifier of a specific blockchain.
 */
type ChainId = number;

/**
 * Interface representing a Harbour-specific signature.
 */
interface HarbourSignature {
	/** The r component of the ECDSA signature. */
	r: string;
	/** The vs component of the ECDSA signature (s and v combined). */
	vs: string;
	/** The transaction hash associated with the signature. */
	txHash: string;
	/** The address of the signer. */
	signer: string;
}

interface MetaTransaction {
	/** The recipient address of the transaction. */
	to: string;
	/** The amount of ETH/native currency to send (in wei, as a string). */
	value: string;
	/** The transaction data (calldata). */
	data: string;
}

/**
 * Interface representing the core parameters of a Safe transaction.
 */
interface SafeTransaction extends MetaTransaction {
	/** The type of operation (call or delegatecall). */
	operation: Operation;
	/** The amount of gas allocated for the Safe transaction execution. */
	safeTxGas: string;
	/** The base gas cost for the transaction (e.g., for data). */
	baseGas: string;
	/** The price of gas for the transaction (in wei, as a string). */
	gasPrice: string;
	/** The address of the token used for gas payments (address(0) for native currency). */
	gasToken: string;
	/** The address to receive any refund from gas payments. */
	refundReceiver: string;
}

/**
 * Interface extending SafeTransaction with Harbour-specific details.
 */
interface HarbourTransactionDetails extends SafeTransaction {
	/** Indicates if the transaction is stored/known by Harbour backend. */
	stored: boolean;
}

/**
 * Interface representing a complete Safe transaction, including nonce, chainId, and Safe address.
 */
interface FullSafeTransaction extends SafeTransaction {
	/** The nonce of the Safe transaction. */
	nonce: string;
	/** The chain ID where the transaction is intended to be executed. */
	chainId: ChainId;
	/** The address of the Safe contract. */
	safeAddress: string;
}

export type {
	Operation,
	ChainId,
	HarbourSignature,
	HarbourTransactionDetails,
	MetaTransaction,
	FullSafeTransaction,
	SafeTransaction,
};
