import type { ChainId } from "@/lib/types";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import type { JsonRpcApiProvider } from "ethers";

/**
 * React hook to retrieve the current chainId from a given ethers provider.
 * Uses TanStack Query for caching and async state management.
 * Returning string is preferred to avoid JSON serialization issues.
 *
 * @param provider An ethers.js JsonRpcApiProvider instance
 * @returns UseQueryResult<ChainId, Error>
 */
export function useChainId(provider: JsonRpcApiProvider | null): UseQueryResult<ChainId, Error> {
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
