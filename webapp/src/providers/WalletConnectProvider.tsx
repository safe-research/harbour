import { Core } from "@walletconnect/core";
import { WalletKit } from "@reown/walletkit";
import { getSdkError } from "@walletconnect/utils";
import type { AnyRouter } from "@tanstack/react-router";
import React, { createContext, useContext, useEffect, useMemo, useState, useRef } from "react";

interface WalletConnectContextValue {
	walletkit: any;
	sessions: Record<string, any>;
	pair: (uri: string) => Promise<void>;
	setSafeContext: (ctx: { safeAddress: string; chainId: number }) => void;
}

const WalletConnectContext = createContext<WalletConnectContextValue | null>(null);

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
	const [walletkit, setWalletkit] = useState<any>(null);
	const [sessions, setSessions] = useState<Record<string, any>>({});

	// Safe context needed to craft namespaces & redirects. We keep the last used pair here.
	const [_, setSafeContext] = useState<{ safeAddress: string; chainId: number } | null>(null);
	// Keep a ref in sync with the latest safeContext so event listeners always read fresh data
	const safeContextRef = useRef<{ safeAddress: string; chainId: number } | null>(null);

	// Expose setter through ref to enable external registration via hook
	const registerSafeContext = (ctx: { safeAddress: string; chainId: number }) => {
		setSafeContext(ctx);
		safeContextRef.current = ctx;
	};

	// Initialise WalletKit once at startup
	useEffect(() => {
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

				// Helper to sync sessions state
				const syncSessions = () => setSessions(wk.getActiveSessions());

				// Register lifecycle listeners
				wk.on("session_proposal", async (proposal: any) => {
					if (!safeContextRef.current) {
						// No safe context -> reject proposal
						await wk.rejectSession({
							id: proposal.id,
							reason: getSdkError("USER_REJECTED_METHODS"),
						});
						return;
					}

					// Build namespaces so dApp gets access to our Safe account only
					const namespaces = {
						eip155: {
							methods: proposal.permissions?.methods || proposal.requiredNamespaces?.eip155?.methods || [],
							events: proposal.permissions?.events || proposal.requiredNamespaces?.eip155?.events || [],
							accounts: [
								`eip155:${safeContextRef.current.chainId}:${safeContextRef.current.safeAddress.toLowerCase()}`,
							],
						},
					};

					await wk.approveSession({ id: proposal.id, namespaces });
					syncSessions();
				});

				wk.on("session_request", async (event: any) => {
					// For now we treat any session_request as a transaction proposal and redirect.
					if (safeContextRef.current) {
						router.navigate({
							to: "/enqueue",
							search: { safe: safeContextRef.current.safeAddress, chainId: safeContextRef.current.chainId },
						});
					}

					// Acknowledge request to avoid hanging the dApp
					await wk.respondSessionRequest({
						id: event.request.id,
						result: null, // The user will handle in /enqueue UI
					});
				});

				wk.on("session_delete", syncSessions);

				// Initial sessions
				syncSessions();
				setWalletkit(wk);
			} catch (err) {
				console.error("Failed to initialise WalletConnect", err);
			}
		}

		init();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	const value = useMemo<WalletConnectContextValue>(
		() => ({
			walletkit,
			sessions,
			pair: async (uri: string) => {
				if (!walletkit) return;
				try {
					await walletkit.pair({ uri });
				} catch (e) {
					console.error("Pairing failed", e);
				}
			},
			setSafeContext: registerSafeContext,
		}),
		[walletkit, sessions],
	);

	return <WalletConnectContext.Provider value={value}>{children}</WalletConnectContext.Provider>;
}

/**
 * Hook to access WalletConnect context.
 */
export function useWalletConnect() {
	const ctx = useContext(WalletConnectContext);
	if (!ctx) throw new Error("useWalletConnect must be used within WalletConnectProvider");
	return ctx;
}

/**
 * Helper hook for pages to register (or update) the Safe context so WalletKit knows which Safe account to expose.
 */
export function useRegisterSafeContext(safeAddress: string, chainId: number) {
	const ctx = useContext(WalletConnectContext);
	useEffect(() => {
		ctx?.setSafeContext?.({ safeAddress, chainId });
	}, [safeAddress, chainId, ctx]);
}
