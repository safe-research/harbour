import { ethereumAddressSchema, hexDataSchema } from "@/lib/validators";
import { type WalletKitTypes as WKTypes, WalletKit } from "@reown/walletkit";
import { Core } from "@walletconnect/core";
import type { SessionTypes as SCTypes } from "@walletconnect/types";
import { getSdkError } from "@walletconnect/utils";
import { z } from "zod";

type WalletKitInstance = Awaited<ReturnType<typeof WalletKit.init>>;

const WALLETCONNECT_PROJECT_ID = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID;

const WALLETCONNECT_EVENTS = {
	SESSION_PROPOSAL: "session_proposal",
	SESSION_REQUEST: "session_request",
	SESSION_DELETE: "session_delete",
} as const;

/**
 * Type guard to determine if a WalletKit session request event is an eth_sendTransaction request.
 *
 * @param event - The WalletKit session request event to check.
 * @returns True if the request method is "eth_sendTransaction", false otherwise.
 */
const isEthSendTransaction = (
	event: WKTypes.SessionRequest,
): event is WKTypes.SessionRequest & { params: { request: { method: "eth_sendTransaction" } } } => {
	return event.params?.request?.method === "eth_sendTransaction";
};

const walletConnectTransactionParamsSchema = z.object({
	to: ethereumAddressSchema,
	value: z.string().optional(),
	data: hexDataSchema.optional(),
	from: ethereumAddressSchema.optional(),
	gas: z.string().optional(),
});

let walletkitInstance: WalletKitInstance | undefined;

/**
 * Lazily initializes and returns a cached WalletKit instance configured with WalletConnect Core.
 *
 * @remarks
 * - Uses the `VITE_WALLETCONNECT_PROJECT_ID` environment variable for the WalletConnect project ID.
 * - Subsequent calls return the already initialized instance.
 *
 * @returns A promise that resolves to the initialized WalletKit instance.
 */
async function initWalletKit(): Promise<WalletKitInstance> {
	if (!walletkitInstance) {
		const core = new Core({ projectId: WALLETCONNECT_PROJECT_ID });
		walletkitInstance = await WalletKit.init({
			core,
			metadata: {
				name: "Harbour Safe Wallet",
				description: "Harbour dashboard acting as a WalletConnect-compatible Safe wallet",
				url: window.location.origin,
				icons: [],
			},
		});
	}
	return walletkitInstance;
}

function canUseWalletConnect(): boolean {
	return Boolean(WALLETCONNECT_PROJECT_ID);
}

export {
	initWalletKit,
	WALLETCONNECT_EVENTS,
	isEthSendTransaction,
	walletConnectTransactionParamsSchema,
	getSdkError,
	type WalletKitInstance,
	type WKTypes as WalletKitTypes,
	type SCTypes as SessionTypes,
	canUseWalletConnect,
};
