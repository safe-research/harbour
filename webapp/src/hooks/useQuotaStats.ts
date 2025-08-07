import { useQuery } from "@tanstack/react-query";
import type { JsonRpcApiProvider } from "ethers";
import { fetchERC20TokenDetails } from "@/lib/erc20";
import { quotaManagerAt } from "@/lib/quotaManager";

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
	quotaManagerAddress?: string,
) {
	const queryKey = ["quotaStats", quotaManagerAddress, signerAddress];
	const queryFn = async () => {
		if (!provider || !signerAddress || !quotaManagerAddress) {
			return EMPTY_QUOTA_STATS;
		}
		const quotaManager = quotaManagerAt(quotaManagerAddress, provider);
		const stats = await quotaManager.availableFreeQuotaForSigner(signerAddress);
		return {
			availableFreeQuota: Number(stats.availableFreeQuota),
			usedSignerQuota: Number(stats.usedSignerQuota),
			nextSignerQuotaReset: Number(stats.nextSignerQuotaReset),
		};
	};
	const enabled = !!provider && !!signerAddress && !!quotaManagerAddress;
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
interface QuotaTokenStats {
	tokenInfo: {
		address: string;
		decimals?: number;
		name?: string;
		symbol?: string;
		balance?: bigint;
	};
	lockedTokens: bigint;
}

function useQuotaTokenStats(
	provider: JsonRpcApiProvider | null,
	signerAddress: string | null | undefined,
	quotaManagerAddress?: string,
) {
	const queryKey = ["quotaTokenStats", quotaManagerAddress, signerAddress];
	const queryFn = async (): Promise<QuotaTokenStats> => {
		if (!provider || !signerAddress || !quotaManagerAddress) {
			throw Error("Not initialized");
		}
		const quotaManager = quotaManagerAt(quotaManagerAddress, provider);
		const tokenAddress = await quotaManager.FEE_TOKEN();
		const tokenInfo = await fetchERC20TokenDetails(
			provider,
			tokenAddress,
			signerAddress,
		);
		const stats = await quotaManager.quotaStatsForSigner(signerAddress);
		return {
			tokenInfo: tokenInfo || { address: tokenAddress },
			lockedTokens: BigInt(stats.tokenBalance),
		};
	};
	const enabled = !!provider && !!signerAddress && !!quotaManagerAddress;
	const {
		data: quotaTokenStats,
		isPending,
		error: queryError,
		refetch,
	} = useQuery<QuotaTokenStats, Error>({
		queryKey,
		queryFn,
		enabled,
	});
	const error = queryError ? queryError.message : null;
	return {
		quotaTokenStats,
		isLoading: enabled && isPending,
		error,
		refresh: refetch,
	};
}

export {
	useQuotaStats,
	type QuotaStats,
	useQuotaTokenStats,
	type QuotaTokenStats,
};
