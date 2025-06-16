import { useContext, useEffect } from "react";
import { WalletConnectContext } from "../providers/WalletConnectProvider";

/**
 * Access the WalletConnect context (walletkit instance, sessions, errors & helpers)
 */
export function useWalletConnect() {
	const ctx = useContext(WalletConnectContext);
	if (!ctx) {
		throw new Error("useWalletConnect must be used within <WalletConnectProvider>");
	}
	return ctx;
}

/**
 * Register (or update) the Safe context that WalletKit should expose to dApps.
 * Keeps the provider-side context in sync whenever safeAddress/chainId change.
 */
export function useRegisterSafeContext(safeAddress: string, chainId: number) {
	const ctx = useContext(WalletConnectContext);
	useEffect(() => {
		ctx?.setSafeContext?.({ safeAddress, chainId });
	}, [safeAddress, chainId, ctx]);
}
