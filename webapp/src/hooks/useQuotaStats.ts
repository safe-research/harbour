import { useQuery } from "@tanstack/react-query";
import type { JsonRpcApiProvider } from "ethers";
import { harbourAt } from "@/lib/harbour";

interface QuotaStats {
	availableFreeQuota: number;
	usedSignerQuota: number;
	nextSignerQuotaReset: number;
}

const EMPTY_QUOTA_STATS: QuotaStats = {
	availableFreeQuota: 0,
	usedSignerQuota: 0,
	nextSignerQuotaReset: 0,
};

function useQuotaStats(
	provider: JsonRpcApiProvider | null,
	signerAddress: string | null | undefined,
	harbourAddress?: string,
) {
	const queryKey = ["quotaStats", harbourAddress, signerAddress];
	const queryFn = async () => {
		console.log({ provider, signerAddress });
		if (!provider || !signerAddress) {
			return EMPTY_QUOTA_STATS;
		}
		const harbour = harbourAt(harbourAddress, provider);
		const stats = await harbour.availableFreeQuotaForSigner(signerAddress);
		return {
			availableFreeQuota: Number(stats.availableFreeQuota),
			usedSignerQuota: Number(stats.usedSignerQuota),
			nextSignerQuotaReset: Number(stats.nextSignerQuotaReset),
		};
	};
	const enabled = !!provider && !!signerAddress && !!harbourAddress;
	const {
		data: quotaStats = EMPTY_QUOTA_STATS,
		isPending,
		error: queryError,
		refetch,
	} = useQuery<QuotaStats, Error>({
		queryKey,
		queryFn,
		enabled,
	});
	const error = queryError ? queryError.message : null;
	return {
		quotaStats,
		isLoading: enabled && isPending,
		error,
		refresh: refetch,
	};
}

export { useQuotaStats };
