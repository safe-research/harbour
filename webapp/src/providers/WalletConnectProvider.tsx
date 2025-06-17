import type { SafeId } from "@/lib/validators";
import {
	type SessionTypes,
	WALLETCONNECT_EVENTS,
	type WalletKitInstance,
	type WalletKitTypes,
	getSdkError,
	initWalletKit,
	isEthSendTransaction,
	walletConnectTransactionParamsSchema,
} from "@/lib/walletconnect";
import type { AnyRouter } from "@tanstack/react-router";
import { ethers } from "ethers";
import type React from "react";
import { createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";

interface WalletConnectContextValue {
	walletkit: WalletKitInstance | null;
	sessions: Record<string, SessionTypes.Struct>;
	error: string | null;
	pair: (uri: string) => Promise<void>;
	setSafeContext: (ctx: SafeId) => void;
}

export const WalletConnectContext = createContext<WalletConnectContextValue | null>(null);

interface WalletConnectProviderProps {
	/** TanStack Router instance so we can redirect programmatically */
	router: AnyRouter;
	children: React.ReactNode;
}

/**
 * WalletConnectProvider sets up a singleton WalletKit instance that acts as a Safe-aware wallet.
 */
function WalletConnectProvider({ router, children }: WalletConnectProviderProps) {
	const [walletkit, setWalletkit] = useState<WalletKitInstance | null>(null);
	const [sessions, setSessions] = useState<Record<string, SessionTypes.Struct>>({});
	// Store the last error so UI can surface it
	const [error, setError] = useState<string | null>(null);

	// Safe context needed to craft namespaces & redirects. We keep the last used pair here.
	const [_, setSafeContext] = useState<{
		safe: string;
		chainId: number;
	} | null>(null);
	// Keep a ref in sync with the latest safeContext so event listeners always read fresh data
	const safeContextRef = useRef<{ safe: string; chainId: number } | null>(null);

	// WalletKit instance retained locally for cleanup; we store in effect scope instead of ref

	// Expose setter through ref to enable external registration via hook
	const registerSafeContext = useCallback((ctx: SafeId) => {
		setSafeContext(ctx);
		safeContextRef.current = ctx;
	}, []);

	useEffect(() => {
		let wkInstance: WalletKitInstance | undefined;
		let isCleanedUp = false;
		type OffEventName = Parameters<WalletKitInstance["off"]>[0];
		type OffHandler = Parameters<WalletKitInstance["off"]>[1];
		const listeners: Array<[OffEventName, OffHandler]> = [];

		async function init() {
			try {
				const wk = await initWalletKit();

				wkInstance = wk;

				const syncSessions = () => {
					const activeSessions = wk.getActiveSessions();
					setSessions(activeSessions);
				};

				const onSessionProposal = async (proposal: WalletKitTypes.SessionProposal) => {
					setError(null);
					if (!safeContextRef.current) {
						await wk.rejectSession({
							id: proposal.id,
							reason: getSdkError("USER_REJECTED_METHODS"),
						});
						return;
					}

					// As workaround, we pretend to support all the required chains plus the current Safe's chain
					const requiredChains = proposal.params.requiredNamespaces?.eip155.chains;
					const eip155ChainIds = [`eip155:${safeContextRef.current.chainId}`].concat(requiredChains ?? []);
					const eip155Accounts = eip155ChainIds.map(
						(eip155ChainId) => `${eip155ChainId}:${safeContextRef.current?.safe.toLowerCase()}`,
					);

					const namespaces = {
						eip155: {
							methods: proposal.params.requiredNamespaces?.eip155?.methods || [],
							events: proposal.params.requiredNamespaces?.eip155?.events || [],
							accounts: eip155Accounts,
						},
					};

					try {
						await wk.approveSession({ id: proposal.id, namespaces });
						syncSessions();
					} catch (err: unknown) {
						const msg = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
						console.error("Failed to approve WalletConnect session", err);
						setError(`Failed to approve WalletConnect session: ${msg}`);
					}
				};
				wk.on(WALLETCONNECT_EVENTS.SESSION_PROPOSAL, onSessionProposal);
				listeners.push([WALLETCONNECT_EVENTS.SESSION_PROPOSAL as OffEventName, onSessionProposal as OffHandler]);

				const onSessionRequest = async (event: WalletKitTypes.SessionRequest) => {
					setError(null);

					if (isEthSendTransaction(event)) {
						const requestParams = event.params.request.params;

						if (Array.isArray(requestParams) && requestParams.length > 0) {
							const parsedTx = walletConnectTransactionParamsSchema.safeParse(requestParams[0]);

							if (!parsedTx.success) {
								console.error("Invalid transaction params:", parsedTx.error.issues || parsedTx.error);
								// Reject the request with proper error
								try {
									await wk.respondSessionRequest({
										topic: event.topic,
										response: {
											id: event.id,
											jsonrpc: "2.0",
											error: {
												code: -32602,
												message: "Invalid transaction parameters",
											},
										},
									});
								} catch (err) {
									console.error("Failed to respond with error", err);
								}
								return;
							}

							if (safeContextRef.current) {
								const activeSessions = wk.getActiveSessions();
								const sessionMetadata = activeSessions[event.topic];
								const wcAppName = sessionMetadata?.peer?.metadata?.name ?? "Unknown dApp";

								let ethValue = "0";
								if (parsedTx.data.value) {
									try {
										const wei = BigInt(parsedTx.data.value);
										ethValue = ethers.formatEther(wei);
									} catch {}
								}

								// Navigate to enqueue flow with proper types
								router.navigate({
									to: "/enqueue",
									search: {
										safe: safeContextRef.current.safe,
										chainId: safeContextRef.current.chainId,
										flow: "walletconnect",
										txTo: parsedTx.data.to,
										txData: parsedTx.data.data ?? "",
										txValue: ethValue,
										wcApp: wcAppName,
										topic: event.topic,
										reqId: event.id.toString(),
									},
								});
							}
							// Skip auto-response; response will be sent from the form
							return;
						}
					}

					// Always respond to other WalletConnect requests
					try {
						await wk.respondSessionRequest({
							topic: event.topic,
							response: { id: event.id, jsonrpc: "2.0", result: null },
						});
					} catch (err: unknown) {
						console.error("Failed to respond to WalletConnect session request", err);
					}
				};
				wk.on(WALLETCONNECT_EVENTS.SESSION_REQUEST, onSessionRequest);
				listeners.push([WALLETCONNECT_EVENTS.SESSION_REQUEST as OffEventName, onSessionRequest as OffHandler]);

				const onSessionDelete = () => syncSessions();
				wk.on(WALLETCONNECT_EVENTS.SESSION_DELETE, onSessionDelete);
				listeners.push([WALLETCONNECT_EVENTS.SESSION_DELETE as OffEventName, onSessionDelete as OffHandler]);

				// Initial sessions
				syncSessions();

				// Only set walletkit if not cleaned up
				if (!isCleanedUp) {
					setWalletkit(wk);
				}
			} catch (err) {
				console.error("Failed to initialise WalletConnect", err);
				if (!isCleanedUp) {
					setError("Failed to initialize WalletConnect");
				}
			}
		}

		init();

		return () => {
			isCleanedUp = true;
			if (wkInstance) {
				for (const [evtName, handler] of listeners) {
					try {
						wkInstance.off(evtName, handler);
					} catch (err) {
						console.error("Failed to remove WalletKit listener", err);
					}
				}
			}
		};
	}, [router]);

	const value = useMemo<WalletConnectContextValue>(
		() => ({
			walletkit,
			sessions,
			error,
			pair: async (uri: string) => {
				if (!walletkit) return;
				try {
					await walletkit.pair({ uri });
				} catch (err: unknown) {
					const msg = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
					console.error("Pairing failed", err);
					setError(`Pairing failed: ${msg}`);
				}
			},
			setSafeContext: registerSafeContext,
		}),
		[walletkit, sessions, error, registerSafeContext],
	);

	return <WalletConnectContext.Provider value={value}>{children}</WalletConnectContext.Provider>;
}

export { WalletConnectProvider };
