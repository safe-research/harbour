import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import type { JsonRpcApiProvider } from "ethers";
import type { ChainId } from "@/lib/types";

/**
 * React hook to retrieve the current chain ID from a given Ethers.js provider.
 * Uses TanStack Query for caching, async state management, and periodic refetching.
 *
 * @param {JsonRpcApiProvider | null} provider - An Ethers.js JsonRpcApiProvider instance. The query is disabled if null.
 * @returns {UseQueryResult<ChainId, Error>} The result object from React Query, containing the chain ID, error, and loading states.
 */
export function useChainId(
	provider: JsonRpcApiProvider | null,
): UseQueryResult<ChainId, Error> {
	return useQuery<ChainId, Error>({
		queryKey: ["chainId", provider],
		queryFn: async () => {
			// biome-ignore lint/style/noNonNullAssertion: non-null assertion is safe here because of the enabled check
			const network = await provider!.getNetwork();
			return Number(network.chainId);
		},
		enabled: !!provider,
		retry: false,
		refetchInterval: 5000,
	});
}
