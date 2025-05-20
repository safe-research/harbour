import { type NonceGroup, fetchSafeQueue } from "@/lib/harbour";
import type { SafeConfiguration } from "@/lib/safe";
import { useQuery } from "@tanstack/react-query";
import type { JsonRpcApiProvider } from "ethers";

interface UseSafeQueueProps {
	provider: JsonRpcApiProvider;
	safeAddress: string;
	safeConfig: Pick<SafeConfiguration, "nonce" | "owners">;
	chainId: number;
	maxNoncesToFetch?: number;
}

function useSafeQueue({ provider, safeAddress, safeConfig, chainId, maxNoncesToFetch = 5 }: UseSafeQueueProps) {
	return useQuery<NonceGroup[], Error, NonceGroup[], [string, string, string, string[], number]>({
		queryKey: ["safeQueue", safeAddress, safeConfig.nonce, safeConfig.owners, maxNoncesToFetch],
		queryFn: async () => {
			return fetchSafeQueue({
				provider,
				safeAddress,
				safeConfig,
				maxNoncesToFetch,
				chainId,
			});
		},
		enabled: !!provider && !!safeConfig && !!safeConfig.nonce && !!safeConfig.owners?.length,
		staleTime: 15 * 1000,
		refetchInterval: 30 * 1000,
		throwOnError: true,
	});
}

export { useSafeQueue };
