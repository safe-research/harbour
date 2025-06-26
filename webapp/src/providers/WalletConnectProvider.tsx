import type { SafeId } from "@/lib/validators";
import {
	type SessionTypes,
	type WalletKitInstance,
	getSdkError,
	initOrGetWalletKit,
} from "@/lib/walletconnect";
import type { AnyRouter } from "@tanstack/react-router";
import type React from "react";
import { type JSX, createContext, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWalletConnectSession } from "@/hooks/useWalletConnectSession";

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
	const safeIdRef = useRef<SafeId | null>(null);

	// Use the session management hook
	const { sessions, error, setError, syncSessions } = useWalletConnectSession({
		walletkit,
		router,
		safeIdRef,
	});

	// Expose setter through ref to enable external registration via hook
	const registerSafeContext = useCallback((id: SafeId) => {
		safeIdRef.current = id;
	}, []);

	useEffect(() => {
		let isCleanedUp = false;

		async function init(): Promise<void> {
			if (isCleanedUp) return;

			try {
				const wk = await initOrGetWalletKit();
				if (isCleanedUp) return;

				setWalletkit(wk);
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
		};
	}, [setError]);

	// Memoize pair function separately to prevent unnecessary re-renders
	const pair = useMemo(
		() => async (uri: string): Promise<void> => {
			if (!walletkit) return;
			try {
				await walletkit.pair({ uri });
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
				console.error("Pairing failed", err);
				setError(`Pairing failed: ${msg}`);
			}
		},
		[walletkit, setError],
	);

	// Memoize disconnectSession function separately to prevent unnecessary re-renders
	const disconnectSession = useMemo(
		() => async (topic: string): Promise<void> => {
			if (!walletkit) return;
			try {
				await walletkit.disconnectSession({ topic, reason: getSdkError("USER_DISCONNECTED") });
				syncSessions();
			} catch (err: unknown) {
				const msg = err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err);
				console.error("Failed to disconnect session", err);
				setError(`Disconnect session failed: ${msg}`);
			}
		},
		[walletkit, syncSessions, setError],
	);

	const value = useMemo<WalletConnectContextValue>(
		() => ({
			walletkit,
			sessions,
			error,
			pair,
			disconnectSession,
			setSafeContext: registerSafeContext,
		}),
		[walletkit, sessions, error, pair, disconnectSession, registerSafeContext],
	);

	return <WalletConnectContext.Provider value={value}>{children}</WalletConnectContext.Provider>;
}

export { WalletConnectContext, WalletConnectProvider };