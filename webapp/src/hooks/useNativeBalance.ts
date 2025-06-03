import { useQuery } from "@tanstack/react-query";
import type { JsonRpcApiProvider } from "ethers";

/**
 * Hook to fetch the native balance for a given Safe address using React Query.
 *
 * @param provider - The JSON-RPC provider to use for fetching the balance
 * @param safeAddress - The Safe address to fetch the balance for
 * @param chainId - The chain ID to include in the cache key for proper invalidation
 * @returns React Query result with the native balance as a bigint
 *
 * @example
 * ```tsx
 * const { data: balance, isLoading, error } = useNativeBalance(provider, "0x123...", 1);
 * if (balance) {
 *   const formatted = ethers.formatEther(balance);
 * }
 * ```
 */
export function useNativeBalance(provider: JsonRpcApiProvider, safeAddress: string, chainId: number) {
	return useQuery<bigint, Error>({
		queryKey: ["nativeBalance", chainId, safeAddress],
		queryFn: () => provider.getBalance(safeAddress),
		enabled: Boolean(provider && safeAddress),
	});
}
