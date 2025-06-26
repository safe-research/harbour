import { type SafeId, ethTransactionParamsSchema } from "@/lib/validators";
import {
	type SessionTypes,
	WALLETCONNECT_EVENTS,
	type WalletKitInstance,
	type WalletKitTypes,
	getSdkError,
	initOrGetWalletKit,
	isEthSendTransaction,
} from "@/lib/walletconnect";
import type { AnyRouter } from "@tanstack/react-router";
import { ethers } from "ethers";
import type React from "react";
import { type JSX, createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";

interface WalletConnectContextValue {
	walletkit: WalletKitInstance | null;
	sessions: Record<string, SessionTypes.Struct>;
	error: string | null;
	pair: (uri: string) => Promise<void>;
	setSafeContext: (ctx: SafeId) => void;
	disconnectSession: (topic: string) => Promise<void>;
}

const WalletConnectContext = createContext<WalletConnectContextValue | null>(null);

interface WalletConnectProviderProps {
	router: AnyRouter;
	children: React.ReactNode;
}

function WalletConnectProvider({ router, children }: WalletConnectProviderProps): JSX.Element {
	// WalletKit is initialized as a singleton via initOrGetWalletKit(),
	// but we store it in React state so that our provider (and its consumers)
	// re-render as soon as the instance is ready.
	const [walletkit, setWalletkit] = useState<WalletKitInstance | null>(null);
	const [sessions, setSessions] = useState<Record<string, SessionTypes.Struct>>({});
	const [error, setError] = useState<string | null>(null);
	const safeIdRef = useRef<SafeId | null>(null);

	// Expose setter through ref to enable external registration via hook
	const registerSafeContext = useCallback((id: SafeId) => {
		safeIdRef.current = id;
	}, []);

	useEffect(() => {
		let cachedWkInstance: WalletKitInstance | undefined;
		let isCleanedUp = false;
		type OffEventName = Parameters<WalletKitInstance["off"]>[0];
		type OffHandler = Parameters<WalletKitInstance["off"]>[1];
		const listeners: Array<[OffEventName, OffHandler]> = [];

		async function init(): Promise<void> {
			try {
				const wk = await initOrGetWalletKit();
				cachedWkInstance = wk;

				const syncSessions = (): void => {
					const activeSessions = wk.getActiveSessions();
					setSessions(activeSessions);
				};

				const onSessionProposal = async (proposal: WalletKitTypes.SessionProposal): Promise<void> => {
					setError(null);
					if (!safeIdRef.current) {
						await wk.rejectSession({
							id: proposal.id,
							reason: getSdkError("UNSUPPORTED_ACCOUNTS"),
						});
						return;
					}

					// WORKAROUND: WalletConnect session proposals under eip155 may not include our Safe’s current chain.
					// To ensure our Safe can sign transactions, merge proposal.params.requiredNamespaces.eip155.chains
					// with our Safe’s chainId and derive full account strings for each chain.
					// Remove this once WalletKit supports adding fallback chains natively.
					const requiredChains = proposal.params.requiredNamespaces?.eip155.chains;
					const eip155ChainIds = [`eip155:${safeIdRef.current.chainId}`].concat(requiredChains ?? []);
					const eip155Accounts = eip155ChainIds.map(
						(eip155ChainId) => `${eip155ChainId}:${safeIdRef.current?.safe.toLowerCase()}`,
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

				const onSessionRequest = async (event: WalletKitTypes.SessionRequest): Promise<void> => {
					setError(null);

					if (isEthSendTransaction(event)) {
						const requestParams = event.params.request.params;

						if (Array.isArray(requestParams) && requestParams.length > 0) {
							const parsedTx = ethTransactionParamsSchema.safeParse(requestParams[0]);

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

							if (safeIdRef.current) {
								const activeSessions = wk.getActiveSessions();
								const sessionMetadata = activeSessions[event.topic];
								const wcAppName = sessionMetadata?.peer?.metadata?.name ?? "Unknown dApp";
								const wcAppUrl = sessionMetadata?.peer?.metadata?.url ?? "";
								const wcAppIcon = sessionMetadata?.peer?.metadata?.icons?.[0] ?? "";
								const wcAppDescription = sessionMetadata?.peer?.metadata?.description ?? "";

								let ethValue = "0";
								if (parsedTx.data.value) {
									try {
										const wei = BigInt(parsedTx.data.value);
										ethValue = ethers.formatEther(wei);
									} catch {}
								}

								router.navigate({
									to: "/enqueue",
									search: {
										safe: safeIdRef.current.safe,
										chainId: safeIdRef.current.chainId,
										flow: "walletconnect",
										txTo: parsedTx.data.to,
										txData: parsedTx.data.data ?? "",
										txValue: ethValue,
										wcApp: wcAppName,
										wcAppUrl,
										wcAppIcon,
										wcAppDescription,
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

				const onSessionDelete = (): void => syncSessions();
				wk.on(WALLETCONNECT_EVENTS.SESSION_DELETE, onSessionDelete);
				listeners.push([WALLETCONNECT_EVENTS.SESSION_DELETE as OffEventName, onSessionDelete as OffHandler]);

				// Initial sessions
				syncSessions();

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

		return (): void => {
			isCleanedUp = true;
			if (cachedWkInstance) {
				for (const [evtName, handler] of listeners) {
					try {
						cachedWkInstance.off(evtName, handler);
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
			pair: async (uri: string): Promise<void> => {
				if (!walletkit) return;
				try {
					await walletkit.pair({ uri });
				} catch (err: unknown) {
					const msg = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
					console.error("Pairing failed", err);
					setError(`Pairing failed: ${msg}`);
				}
			},
			disconnectSession: async (topic: string): Promise<void> => {
				if (!walletkit) return;
				try {
					await walletkit.disconnectSession({ topic, reason: getSdkError("USER_DISCONNECTED") });
				} catch (err: unknown) {
					const msg = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
					console.error("Failed to disconnect session", err);
					setError(`Disconnect session failed: ${msg}`);
				}
			},
			setSafeContext: registerSafeContext,
		}),
		[walletkit, sessions, error, registerSafeContext],
	);

	return <WalletConnectContext.Provider value={value}>{children}</WalletConnectContext.Provider>;
}

export { WalletConnectContext, WalletConnectProvider };
