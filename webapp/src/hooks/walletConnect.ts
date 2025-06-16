import { useContext, useEffect, useMemo } from "react";
import { WalletConnectContext } from "../providers/WalletConnectProvider";
import { ethereumAddressSchema } from "@/lib/validators";
import { z } from "zod";

/**
 * Access the WalletConnect context (walletkit instance, sessions, errors & helpers)
 */
export function useWalletConnect() {
	const ctx = useContext(WalletConnectContext);
	if (!ctx) {
		throw new Error("useWalletConnect must be used within <WalletConnectProvider>");
	}

	// Memoize the context value to prevent unnecessary re-renders
	return useMemo(() => ctx, [ctx]);
}

// Schema for safe context validation
const safeContextSchema = z.object({
	safeAddress: ethereumAddressSchema,
	chainId: z.number().int().positive(),
});

/**
 * Register (or update) the Safe context that WalletKit should expose to dApps.
 * Keeps the provider-side context in sync whenever safeAddress/chainId change.
 */
export function useRegisterSafeContext(safeAddress: string, chainId: number) {
	const ctx = useContext(WalletConnectContext);

	useEffect(() => {
		if (!ctx?.setSafeContext) return;

		try {
			// Validate parameters before setting
			const validatedContext = safeContextSchema.parse({ safeAddress, chainId });
			ctx.setSafeContext(validatedContext);
		} catch (error) {
			console.error("Invalid Safe context parameters:", error);
			// Don't set invalid context
		}
	}, [safeAddress, chainId, ctx]);
}
