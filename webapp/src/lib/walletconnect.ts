import { WalletKit, type WalletKitTypes as WKTypes } from "@reown/walletkit";
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
 * Regular expression for WalletConnect URI validation
 * Matches wc: followed by session topic and version 2 parameters
 */
const WALLETCONNECT_URI_REGEX = /^wc:[a-zA-Z0-9]+@2\?/;

/**
 * Schema for validating WalletConnect URIs
 */
const walletConnectUriSchema = z
	.string()
	.regex(WALLETCONNECT_URI_REGEX, "Invalid WalletConnect URI");

/**
 * Type guard to determine if a session request is eth_sendTransaction
 */
function isEthSendTransaction(
	event: WKTypes.SessionRequest,
): event is WKTypes.SessionRequest & {
	params: { request: { method: "eth_sendTransaction" } };
} {
	return event.params?.request?.method === "eth_sendTransaction";
}

let walletkitInitPromise: Promise<WalletKitInstance> | undefined;
/**
 * Lazily initializes and returns a cached WalletKit instance configured with WalletConnect Core.
 *
 * This function is safe to call multiple times: if initialization is already in progress or completed,
 * it returns the same promise without invoking WalletKit.init again, which must be called only once.
 *
 * @returns A promise that resolves to the initialized WalletKit instance.
 */
async function initOrGetWalletKit(): Promise<WalletKitInstance> {
	if (!walletkitInitPromise) {
		const core = new Core({ projectId: WALLETCONNECT_PROJECT_ID });
		walletkitInitPromise = (async () => {
			try {
				return await WalletKit.init({
					core,
					metadata: {
						name: "Harbour Safe Wallet",
						description:
							"Harbour dashboard acting as a WalletConnect-compatible Safe wallet",
						url: window.location.origin,
						icons: [],
					},
				});
			} catch (error) {
				// Reset the promise on failure to allow retry on next call
				walletkitInitPromise = undefined;
				throw error;
			}
		})();
	}

	return walletkitInitPromise;
}

/**
 * Checks if WalletConnect can be used by verifying the presence of the project ID.
 *
 * @returns `true` if `WALLETCONNECT_PROJECT_ID` is defined and truthy, otherwise `false`.
 */
function canUseWalletConnect(): boolean {
	return Boolean(WALLETCONNECT_PROJECT_ID);
}

export type {
	WalletKitInstance,
	WKTypes as WalletKitTypes,
	SCTypes as SessionTypes,
};
export {
	initOrGetWalletKit,
	WALLETCONNECT_EVENTS,
	isEthSendTransaction,
	getSdkError,
	canUseWalletConnect,
	walletConnectUriSchema,
};
