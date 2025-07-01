import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import type { JsonRpcApiProvider } from "ethers";
import { fetchSafeQueue, type NonceGroup } from "@/lib/harbour";
import type { SafeConfiguration } from "@/lib/safe";
import type { ChainId } from "@/lib/types";

interface UseSafeQueueProps {
	/** Ethers.js JSON RPC API provider for the Harbour chain. */
	provider: JsonRpcApiProvider;
	/** The address of the Safe contract. */
	safeAddress: string;
	/** Partial Safe configuration, specifically needing nonce and owners. */
	safeConfig: Pick<SafeConfiguration, "nonce" | "owners">;
	/** The chain ID of the Safe contract (not Harbour's chain ID). */
	safeChainId: ChainId;
	/** Optional maximum number of nonces to fetch ahead of the current Safe nonce (default: 5). */
	maxNoncesToFetch?: number;
}

/**
 * Custom React Query hook to fetch the transaction queue for a Safe from the Harbour contract.
 *
 * @param {UseSafeQueueProps} props - Parameters for fetching the queue.
 * @returns {UseQueryResult<NonceGroup[], Error>} The React Query result object containing the queue data, loading state, and error state.
 */
function useSafeQueue({
	provider,
	safeAddress,
	safeConfig,
	safeChainId,
	maxNoncesToFetch = 5,
}: UseSafeQueueProps): UseQueryResult<NonceGroup[], Error> {
	return useQuery<NonceGroup[], Error, NonceGroup[], readonly unknown[]>({
		queryKey: [
			"safeQueue",
			safeAddress,
			safeConfig.nonce,
			safeConfig.owners,
			maxNoncesToFetch,
		],
		queryFn: async () => {
			return fetchSafeQueue({
				provider,
				safeAddress,
				safeConfig,
				maxNoncesToFetch,
				safeChainId,
			});
		},
		enabled:
			!!provider &&
			!!safeConfig &&
			!!safeConfig.nonce &&
			!!safeConfig.owners?.length,
		staleTime: 15 * 1000,
		refetchInterval: 30 * 1000,
		throwOnError: true,
	});
}

export { useSafeQueue };
