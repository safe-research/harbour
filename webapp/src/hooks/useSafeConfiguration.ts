import type { SafeConfiguration } from "@/lib/safe";
import { getSafeConfiguration } from "@/lib/safe";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import type { JsonRpcApiProvider } from "ethers";
import { useChainId } from "./useChainId";

/**
 * Custom hook to fetch the configuration of a Safe using React Query.
 * It retrieves the chain ID from the provider and then calls `getSafeConfiguration`.
 *
 * @param {JsonRpcApiProvider | null} provider - The Ethers JSON RPC API provider. The query is disabled if null.
 * @param {string} safeAddress - The address of the Safe contract.
 * @param {Parameters<typeof getSafeConfiguration>[2]} [options] - Optional parameters for `getSafeConfiguration`.
 * @returns {UseQueryResult<SafeConfiguration, Error>} The result object from React Query, containing data, error, and loading states.
 */
export function useSafeConfiguration(
	provider: JsonRpcApiProvider | null,
	safeAddress: string,
	options?: Parameters<typeof getSafeConfiguration>[2],
): UseQueryResult<SafeConfiguration, Error> {
	const { data: chainId } = useChainId(provider);

	return useQuery<SafeConfiguration, Error>({
		queryKey: ["safeConfig", chainId, safeAddress],
		queryFn: async () => {
			// biome-ignore lint/style/noNonNullAssertion: non-null assertion is safe here because of the enabled check
			const result = await getSafeConfiguration(provider!, safeAddress, options);
			return result;
		},
		enabled: Boolean(provider && chainId && safeAddress),
		retry: false,
		staleTime: 15 * 1000,
		refetchInterval: 30 * 1000,
	});
}
