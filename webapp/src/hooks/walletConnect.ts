import { safeIdSchema } from "@/lib/validators";
import { useContext, useEffect, useMemo } from "react";
import { WalletConnectContext } from "../providers/WalletConnectProvider";

/**
 * Retrieves the WalletConnect context, including the WalletKit instance,
 * active sessions, any errors, and helper methods.
 *
 * @returns The WalletConnect context containing walletkit, sessions, errors, and helpers.
 * @throws Error if used outside a WalletConnectProvider.
 */
export function useWalletConnect() {
	const ctx = useContext(WalletConnectContext);
	if (!ctx) {
		throw new Error("useWalletConnect must be used within <WalletConnectProvider>");
	}

	// Memoize the context value to prevent unnecessary re-renders
	return useMemo(() => ctx, [ctx]);
}

/**
 * Registers or updates the Safe context in WalletConnect to expose to dApps.
 * Ensures that the provider-side Safe context stays in sync when parameters change.
 *
 * @param safeAddress The Safe contract address to register.
 * @param chainId The chain ID where the Safe contract is deployed.
 * @returns void
 */
export function useRegisterSafeContext(safeAddress: string, chainId: number) {
	const ctx = useContext(WalletConnectContext);

	useEffect(() => {
		if (!ctx?.setSafeContext) return;

		try {
			const validatedContext = safeIdSchema.parse({ safeAddress, chainId });
			ctx.setSafeContext(validatedContext);
		} catch (error) {
			console.error("Invalid Safe context parameters:", error);
		}
	}, [safeAddress, chainId, ctx]);
}
