import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { ethers } from "ethers";
import type { SettingsFormData } from "@/components/settings/SettingsForm";
import { useSession } from "@/contexts/SessionContext";
import { useHarbourRpcProvider } from "@/hooks/useRpcProvider";

type UseRelayerBalanceInfoProps = Pick<Partial<SettingsFormData>, "rpcUrl">;

interface RelayerBalanceInfo {
	formatted: string;
	needsFunding: boolean;
	faucet?: string;
}

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
		queryFn: async () => {
			if (!provider || !keys) {
				return null;
			}

			const { chainId } = await provider.getNetwork();
			const balance = await provider.getBalance(keys.relayer);

			return {
				formatted: `Ξ${ethers.formatEther(balance)}`,
				needsFunding: balance === 0n,
				faucet:
					chainId === 100n
						? `https://faucet.gnosischain.com/?address=${keys.relayer.address}`
						: undefined,
			};
		},
		enabled: !!provider && !!keys,
		staleTime: 2500,
		refetchInterval: 5000,
	});
}

export { useRelayerBalanceInfo };
