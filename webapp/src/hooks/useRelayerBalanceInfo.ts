import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import type { SettingsFormData } from "@/components/settings/SettingsForm";
import { useSession } from "@/contexts/SessionContext";
import { useHarbourRpcProvider } from "@/hooks/useRpcProvider";
import { getRelayerBalanceInfo, type RelayerBalanceInfo } from "@/lib/relaying";

type UseRelayerBalanceInfoProps = Pick<Partial<SettingsFormData>, "rpcUrl">;

/**
 * Custom React Query hook to fetch the current relayer balance information.
 */
function useRelayerBalanceInfo(
	currentSettings: UseRelayerBalanceInfoProps,
): UseQueryResult<RelayerBalanceInfo | null, Error> {
	const { keys } = useSession();
	const { provider } = useHarbourRpcProvider(currentSettings);

	return useQuery<RelayerBalanceInfo | null, Error>({
		queryKey: [
			"relayerBalance",
			keys?.relayer?.address,
			currentSettings?.rpcUrl,
		],
		queryFn: () => {
			if (!provider || !keys) {
				return null;
			}
			return getRelayerBalanceInfo({ relayer: keys.relayer.address, provider });
		},
		enabled: !!provider && !!keys,
		staleTime: 2500,
		refetchInterval: 5000,
	});
}

export { useRelayerBalanceInfo };
