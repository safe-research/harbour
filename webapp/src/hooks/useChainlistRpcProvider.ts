import type { JsonRpcApiProvider, JsonRpcApiProviderOptions } from "ethers";
import { JsonRpcProvider } from "ethers";
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

// Define default provider options to keep a constant reference
// So that the hook doesn't re-create the provider options object on every render
// If the default is used
const DEFAULT_PROVIDER_OPTIONS: JsonRpcApiProviderOptions = {
	batchMaxCount: 1,
};

/**
 * Custom hook to get an Ethers JsonRpcApiProvider for a given chain ID.
 * It fetches the RPC URL from a predefined list (simulating Chainlist) and initializes the provider.
 * @param {number} chainId - The chain ID for which to get the provider.
 * @param {JsonRpcApiProviderOptions} providerOptions - The options to pass to the provider. We disable batching by default because
 *                                                      we cannot guarantee that the random RPC URLs will support batching.
 * @returns {UseChainlistRpcProviderResult} An object containing the provider, error state, and loading state.
 */
export function useChainlistRpcProvider(
	chainId: number,
	providerOptions: JsonRpcApiProviderOptions = DEFAULT_PROVIDER_OPTIONS,
): UseChainlistRpcProviderResult {
	const [provider, setProvider] = useState<JsonRpcApiProvider | null>(null);
	const [error, setError] = useState<Error | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(true);

	useEffect(() => {
		let cancelled = false;
		setIsLoading(true);
		setError(null);
		setProvider(null);

		(async () => {
			try {
				const url = await getRpcUrlByChainId(chainId);
				if (!cancelled) {
					setProvider(new JsonRpcProvider(url, undefined, providerOptions));
				}
			} catch (e) {
				if (e instanceof Error) {
					!cancelled && setError(e);
				} else {
					!cancelled &&
						setError(
							new Error("Unknown error occurred while fetching RPC URL"),
						);
				}
			} finally {
				!cancelled && setIsLoading(false);
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [chainId, providerOptions]);

	return { provider, error, isLoading };
}
