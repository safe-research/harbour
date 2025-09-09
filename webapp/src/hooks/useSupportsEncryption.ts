import { useQuery } from "@tanstack/react-query";
import {
	type HarbourContractSettings,
	supportsEncryption,
} from "@/lib/harbour";

/**
 * Hook for whether or not the currently configured Harbour contract supports
 * encryption.
 */
export function useSupportsEncryption({
	harbourAddress,
	rpcUrl,
}: HarbourContractSettings = {}) {
	return useQuery<boolean, Error>({
		queryKey: ["supportsSecretHarbour", harbourAddress, rpcUrl],
		queryFn: () => supportsEncryption({ harbourAddress, rpcUrl }),
	});
}
