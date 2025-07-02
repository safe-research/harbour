import { useQuery } from "@tanstack/react-query";
import type { JsonRpcApiProvider } from "ethers";
import { type ERC20TokenDetails, fetchERC20TokenDetails } from "@/lib/erc20";

/**
 * Hook to fetch ERC20 token details (name, symbol, decimals, balance) for a given token and owner.
 *
 * @param provider - The JSON-RPC provider to use for fetching token details.
 * @param tokenAddress - The ERC20 token contract address.
 * @param ownerAddress - The address whose token balance will be fetched.
 * @param chainId - The chain ID to include in the cache key for proper invalidation.
 * @returns React Query result with ERC20TokenDetails or null.
 *
 * @example
 * ```tsx
 * const { data, isLoading, error } = useERC20TokenDetails(provider, tokenAddress, safeAddress, chainId);
 * if (data) {
 *   console.log(data.symbol, formatUnits(data.balance, data.decimals));
 * }
 * ```
 */
export function useERC20TokenDetails(
	provider: JsonRpcApiProvider,
	tokenAddress: string,
	ownerAddress: string,
	chainId: number,
) {
	return useQuery<ERC20TokenDetails | null, Error>({
		queryKey: ["erc20TokenDetails", chainId, tokenAddress, ownerAddress],
		queryFn: () => fetchERC20TokenDetails(provider, tokenAddress, ownerAddress),
		enabled:
			Boolean(provider) &&
			Boolean(tokenAddress) &&
			tokenAddress !== "" &&
			Boolean(ownerAddress),
	});
}
