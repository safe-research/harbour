import { JsonRpcProvider } from "ethers";
import type { JsonRpcApiProvider } from "ethers";
import { useEffect, useState } from "react";
import { getRpcUrlByChainId } from "../lib/chains";

/**
 * Represents the result of the useChainlistRpcProvider hook.
 */
interface UseChainlistRpcProviderResult {
	/** The Ethers JsonRpcApiProvider instance, or null if not yet initialized or an error occurred. */
	provider: JsonRpcApiProvider | null;
	/** An error object if fetching the RPC URL or initializing the provider failed, otherwise null. */
	error: Error | null;
	/** A boolean indicating if the provider is currently being initialized. */
	isLoading: boolean;
}

/**
 * Custom hook to get an Ethers JsonRpcApiProvider for a given chain ID.
 * It fetches the RPC URL from a predefined list (simulating Chainlist) and initializes the provider.
 * @param {number} chainId - The chain ID for which to get the provider.
 * @returns {UseChainlistRpcProviderResult} An object containing the provider, error state, and loading state.
 */
export function useChainlistRpcProvider(chainId: number): UseChainlistRpcProviderResult {
	const [provider, setProvider] = useState<JsonRpcApiProvider | null>(null);
	const [error, setError] = useState<Error | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(true);

	useEffect(() => {
		setIsLoading(true);
		setError(null);
		setProvider(null);

		(async () => {
			try {
				const url = await getRpcUrlByChainId(chainId);
				setProvider(new JsonRpcProvider(url));
			} catch (e) {
				if (e instanceof Error) {
					setError(e);
				} else {
					setError(new Error("Unknown error occurred while fetching RPC URL"));
				}
			} finally {
				setIsLoading(false);
			}
		})();
	}, [chainId]);

	return { provider, error, isLoading };
}
