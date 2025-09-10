import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import {
	fetchSafeOwnerEncryptionPublicKeys,
	type SafeOwnerEncryptionPublicKeys,
} from "@/lib/harbour";
import type { SafeConfiguration } from "@/lib/safe";

interface UseEncryptionPublicKeysProps {
	/** Partial Safe configuration, specifically owners. */
	safeConfig: Pick<SafeConfiguration, "owners"> | null | undefined;
}

/**
 * Custom React Query hook to fetch public encryption keys for the owners of the Safe.
 *
 * @param {UseEncryptionKeysProps} props - Parameters for fetching the encryption keys.
 * @returns {UseQueryResult<NonceGroup[], Error>} The React Query result object containing the queue data, loading state, and error state.
 */
function useEncryptionPublicKeys({
	safeConfig: maybeSafeConfig,
}: UseEncryptionPublicKeysProps): UseQueryResult<
	SafeOwnerEncryptionPublicKeys,
	Error
> {
	return useQuery({
		queryKey: ["publicEncryptionKeys", maybeSafeConfig?.owners ?? []],
		queryFn: async () => {
			// biome-ignore lint/style/noNonNullAssertion: non-null assertion is safe here because of the enabled check
			const safeConfig = maybeSafeConfig!;
			return fetchSafeOwnerEncryptionPublicKeys({ safeConfig });
		},
		enabled: !!maybeSafeConfig?.owners?.length,
		staleTime: 15 * 1000,
		refetchInterval: 30 * 1000,
		throwOnError: true,
	});
}

export { useEncryptionPublicKeys };
