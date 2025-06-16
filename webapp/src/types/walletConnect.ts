import type { WalletKitTypes } from "@reown/walletkit";
import { z } from "zod";
import { ethereumAddressSchema, hexDataSchema } from "@/lib/validators";

// Schema for WalletConnect transaction parameters
export const walletConnectTransactionParamsSchema = z.object({
	to: ethereumAddressSchema,
	value: z.string().optional(),
	data: hexDataSchema.optional(),
	from: ethereumAddressSchema.optional(),
	gas: z.string().optional(),
});

export type WalletConnectTransactionParams = z.infer<typeof walletConnectTransactionParamsSchema>;

// Schema for WalletConnect request identifiers
export const walletConnectRequestIdentifiersSchema = z.object({
	topic: z.string().min(1),
	reqId: z.string().min(1),
});

export type WalletConnectRequestIdentifiers = z.infer<typeof walletConnectRequestIdentifiersSchema>;

// Define namespace structure for WalletConnect sessions
interface Namespace {
	chains?: string[];
	methods?: string[];
	events?: string[];
	accounts?: string[];
}

// Define proper type for WalletKit sessions based on the actual shape
export interface WalletKitSession {
	peer: {
		metadata: {
			name: string;
			url: string;
			icons?: string[];
		};
	};
	expiry: number;
	topic: string;
	namespaces: Record<string, Namespace>;
	acknowledged: boolean;
	controller: string;
	requiredNamespaces: Record<string, Namespace>;
	optionalNamespaces?: Record<string, Namespace>;
	sessionProperties?: Record<string, string>;
	expiryTimestamp?: number;
}

// Event constants - these are string literals used by WalletKit
export const WALLETCONNECT_EVENTS = {
	SESSION_PROPOSAL: "session_proposal",
	SESSION_REQUEST: "session_request",
	SESSION_DELETE: "session_delete",
} as const;

// User-friendly error messages
export const USER_FRIENDLY_ERRORS = {
	INVALID_URI: "Please enter a valid WalletConnect URI",
	CONNECTION_FAILED: "Failed to connect. Please try again",
	TRANSACTION_FAILED: "Transaction submission failed",
	SESSION_EXPIRED: "Session has expired. Please reconnect",
} as const;

// Type guard for session request events
export const isEthSendTransaction = (
	event: WalletKitTypes.SessionRequest,
): event is WalletKitTypes.SessionRequest & { params: { request: { method: "eth_sendTransaction" } } } => {
	return event.params?.request?.method === "eth_sendTransaction";
};

// Extended search params schema for enqueue route
export const enqueueSearchParamsSchema = z.object({
	safeAddress: ethereumAddressSchema,
	chainId: z.string(),
	flow: z.string().optional(),
	tokenAddress: ethereumAddressSchema.optional(),
	txTo: ethereumAddressSchema.optional(),
	txValue: z.string().optional(),
	txData: hexDataSchema.optional(),
	wcApp: z.string().optional(),
	topic: z.string().optional(),
	reqId: z.string().optional(),
});

export type EnqueueSearchParams = z.infer<typeof enqueueSearchParamsSchema>;

// WalletConnect-specific params schema for transaction forms
export const walletConnectParamsSchema = z.object({
	txTo: ethereumAddressSchema.optional(),
	txValue: z.string().optional(),
	txData: hexDataSchema.optional(),
	wcApp: z.string().optional(),
	topic: z.string().optional(),
	reqId: z.string().optional(),
});

export type WalletConnectParams = z.infer<typeof walletConnectParamsSchema>;
