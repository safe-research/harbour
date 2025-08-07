import type { JsonRpcApiProvider } from "ethers";
import { useEffect } from "react";
import { Box, BoxTitle } from "@/components/Groups";
import { useQuotaStats } from "@/hooks/useQuotaStats";

function QuotaStats({
	signerAddress,
	harbourProvider,
	quotaManagerAddress,
	updateIsLoading,
	className,
	refreshTrigger,
}: {
	signerAddress: string | undefined;
	harbourProvider: JsonRpcApiProvider | null;
	quotaManagerAddress: string | undefined;
	refreshTrigger?: number;
	updateIsLoading?: (isLoading: boolean) => void;
	className?: string;
}) {
	const {
		quotaStats,
		isLoading: isLoadingQuota,
		refresh,
	} = useQuotaStats(harbourProvider, signerAddress, quotaManagerAddress);

	useEffect(() => {
		updateIsLoading?.(isLoadingQuota);
	}, [isLoadingQuota, updateIsLoading]);

	useEffect(() => {
		// Use variable here to silence lint that flags this dependency as unused
		refreshTrigger;
		refresh();
	}, [refreshTrigger, refresh]);

	return (
		<div className={`grid gap-2 md:grid-cols-3 grid-cols-1 ${className}`}>
			<Box>
				<BoxTitle>Available Quota</BoxTitle>
				{isLoadingQuota ? "-" : quotaStats.availableFreeQuota}
			</Box>
			<Box>
				<BoxTitle>Used Quota</BoxTitle>
				{isLoadingQuota ? "-" : quotaStats.usedSignerQuota}
			</Box>
			<Box>
				<BoxTitle>Next Reset</BoxTitle>
				{isLoadingQuota
					? "-"
					: new Date(quotaStats.nextSignerQuotaReset * 1000).toLocaleString()}
			</Box>
		</div>
	);
}

export { QuotaStats };
