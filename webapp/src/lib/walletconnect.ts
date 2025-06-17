import { ethereumAddressSchema, hexDataSchema } from "@/lib/validators";
import { type WalletKitTypes as WKTypes, WalletKit } from "@reown/walletkit";
import { Core } from "@walletconnect/core";
import type { SessionTypes as SCTypes } from "@walletconnect/types";
import { getSdkError } from "@walletconnect/utils";
import { z } from "zod";

type WalletKitInstance = Awaited<ReturnType<typeof WalletKit.init>>;

const WALLETCONNECT_EVENTS = {
	SESSION_PROPOSAL: "session_proposal",
	SESSION_REQUEST: "session_request",
	SESSION_DELETE: "session_delete",
} as const;

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

async function initWalletKit(): Promise<WalletKitInstance> {
	if (!walletkitInstance) {
		const core = new Core({ projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID });
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

export {
	initWalletKit,
	WALLETCONNECT_EVENTS,
	isEthSendTransaction,
	walletConnectTransactionParamsSchema,
	getSdkError,
	type WalletKitInstance,
	type WKTypes as WalletKitTypes,
	type SCTypes as SessionTypes,
};
