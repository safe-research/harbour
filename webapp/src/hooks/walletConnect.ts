import { useContext, useEffect } from "react";
import { WalletConnectContext } from "../providers/WalletConnectProvider";

/**
 * Retrieves the WalletConnect context, including the WalletKit instance,
 * active sessions, any errors, and helper methods.
 *
 * @returns WalletConnect context containing walletkit, sessions, errors, and helpers.
 * @throws Error if used outside a WalletConnectProvider.
 */
function useWalletConnect() {
	const ctx = useContext(WalletConnectContext);
	if (!ctx) {
		throw new Error(
			"useWalletConnect must be used within <WalletConnectProvider>",
		);
	}

	return ctx;
}

/**
 * Registers or updates the Safe context in WalletConnect to expose to dApps.
 * Ensures that the provider-side Safe context stays in sync when parameters change.
 *
 * @param safe The Safe contract address to register.
 * @param chainId The chain ID where the Safe contract is deployed.
 * @returns void
 */
function useRegisterSafeContext(safe: string, chainId: number) {
	const ctx = useContext(WalletConnectContext);

	useEffect(() => {
		ctx?.setSafeContext({ safe, chainId });
	}, [safe, chainId, ctx]);
}

export { useWalletConnect, useRegisterSafeContext };
