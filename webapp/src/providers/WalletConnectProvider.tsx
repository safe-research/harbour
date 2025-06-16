import { WalletKit, type WalletKitTypes } from "@reown/walletkit";
import type { AnyRouter } from "@tanstack/react-router";
import { Core } from "@walletconnect/core";
import { getSdkError } from "@walletconnect/utils";
import type React from "react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

// Minimal shape of a WalletKit session we rely on in the UI
interface SessionMetadata {
	peer: { metadata: { name: string; url: string } };
	expiry: number;
	topic: string;
	// Catch-all for additional fields we don't use directly
	[key: string]: unknown;
}

type WalletKitInstance = Awaited<ReturnType<typeof WalletKit.init>>;

interface WalletConnectContextValue {
	walletkit: WalletKitInstance | null;
	sessions: Record<string, SessionMetadata>;
	error: string | null;
	pair: (uri: string) => Promise<void>;
	setSafeContext: (ctx: { safeAddress: string; chainId: number }) => void;
}

export const WalletConnectContext = createContext<WalletConnectContextValue | null>(null);

interface WalletConnectProviderProps {
	/** TanStack Router instance so we can redirect programmatically */
	router: AnyRouter;
	children: React.ReactNode;
}

/**
 * WalletConnectProvider sets up a singleton WalletKit instance that acts as a Safe-aware wallet.
 * It exposes current active sessions and a `pair` helper to initiate a connection from a wc: URI.
 *
 * On any incoming session_request from a dApp (used as a transaction proposal), the user is redirected
 * to the `/enqueue` flow so they can review and enqueue the transaction in their Safe.
 */
export function WalletConnectProvider({ router, children }: WalletConnectProviderProps) {
	const [walletkit, setWalletkit] = useState<WalletKitInstance | null>(null);
	const [sessions, setSessions] = useState<Record<string, SessionMetadata>>({});
	// Store the last error so UI can surface it
	const [error, setError] = useState<string | null>(null);

	// Safe context needed to craft namespaces & redirects. We keep the last used pair here.
	const [_, setSafeContext] = useState<{ safeAddress: string; chainId: number } | null>(null);
	// Keep a ref in sync with the latest safeContext so event listeners always read fresh data
	const safeContextRef = useRef<{ safeAddress: string; chainId: number } | null>(null);

	// WalletKit instance retained locally for cleanup; we store in effect scope instead of ref

	// Expose setter through ref to enable external registration via hook
	const registerSafeContext = useCallback((ctx: { safeAddress: string; chainId: number }) => {
		setSafeContext(ctx);
		safeContextRef.current = ctx;
	}, []);

	useEffect(() => {
		let wkInstance: WalletKitInstance | undefined;
		type OffEventName = Parameters<WalletKitInstance["off"]>[0];
		type OffHandler = Parameters<WalletKitInstance["off"]>[1];
		const listeners: Array<[OffEventName, OffHandler]> = [];

		async function init() {
			try {
				const core = new Core({ projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID });
				const wk = await WalletKit.init({
					core,
					metadata: {
						name: "Harbour Safe Wallet",
						description: "Harbour dashboard acting as a WalletConnect-compatible Safe wallet",
						url: window.location.origin,
						icons: [],
					},
				});

				wkInstance = wk;

				// Helper to sync sessions state
				const syncSessions = () => setSessions(wk.getActiveSessions() as unknown as Record<string, SessionMetadata>);

				const onSessionProposal = async (proposal: WalletKitTypes.SessionProposal) => {
					setError(null);
					if (!safeContextRef.current) {
						await wk.rejectSession({ id: proposal.id, reason: getSdkError("USER_REJECTED_METHODS") });
						return;
					}

					// As workaround, we pretend to support all the required chains plus the current Safe's chain
					const requiredChains = proposal.params.requiredNamespaces?.eip155.chains;
					const eip155ChainIds = [`eip155:${safeContextRef.current.chainId}`].concat(requiredChains ?? []);
					const eip155Accounts = eip155ChainIds.map(
						(eip155ChainId) => `${eip155ChainId}:${safeContextRef.current?.safeAddress.toLowerCase()}`,
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
				wk.on("session_proposal", onSessionProposal);
				listeners.push(["session_proposal" as OffEventName, onSessionProposal as OffHandler]);

				const onSessionRequest = async (event: WalletKitTypes.SessionRequest) => {
					setError(null);
					if (safeContextRef.current) {
						router.navigate({
							to: "/enqueue",
							search: {
								safe: safeContextRef.current.safeAddress,
								chainId: safeContextRef.current.chainId,
							},
						});
					}

					await wk.respondSessionRequest({
						topic: event.topic,
						response: { id: event.id, jsonrpc: "2.0", result: null },
					});
				};
				wk.on("session_request", onSessionRequest);
				listeners.push(["session_request" as OffEventName, onSessionRequest as OffHandler]);

				const onSessionDelete = () => syncSessions();
				wk.on("session_delete", onSessionDelete);
				listeners.push(["session_delete" as OffEventName, onSessionDelete as OffHandler]);

				// Initial sessions
				syncSessions();
				setWalletkit(wk);
			} catch (err) {
				console.error("Failed to initialise WalletConnect", err);
			}
		}

		init();

		return () => {
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

// Hooks moved to dedicated module to satisfy Vite's Consistent Component Exports rule.
