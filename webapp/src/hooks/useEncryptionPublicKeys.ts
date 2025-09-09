import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { fetchEncryptionPublicKeys } from "@/lib/harbour";
import type { SafeConfiguration } from "@/lib/safe";

interface UseEncryptionPublicKeysProps {
	/** Partial Safe configuration, specifically owners. */
	safeConfig: Pick<SafeConfiguration, "owners"> | null | undefined;
}

type UseEncryptionPublicKeysResult =
	| {
			/** Encryption is disabled for this Harbour configuration */
			enabled: false;
	  }
	| {
			/** Encryption is enabled for this Harbour configuration */
			enabled: true;
			/** The registered public keys of the Safe owners */
			publicKeys: CryptoKey[];
			/** The owners without registered public keys */
			missingRegistrations: string[];
	  };

/**
 * Custom React Query hook to fetch public encryption keys for the owners of the Safe.
 *
 * @param {UseEncryptionKeysProps} props - Parameters for fetching the encryption keys.
 * @returns {UseQueryResult<NonceGroup[], Error>} The React Query result object containing the queue data, loading state, and error state.
 */
function useEncryptionPublicKeys({
	safeConfig: maybeSafeConfig,
}: UseEncryptionPublicKeysProps): UseQueryResult<
	UseEncryptionPublicKeysResult,
	Error
> {
	return useQuery({
		queryKey: ["publicEncryptionKeys", maybeSafeConfig?.owners ?? []],
		queryFn: async () => {
			// biome-ignore lint/style/noNonNullAssertion: non-null assertion is safe here because of the enabled check
			const safeConfig = maybeSafeConfig!;
			const publicKeys = await fetchEncryptionPublicKeys({ safeConfig });

			if (publicKeys === null) {
				return { enabled: false } as const;
			}

			const missingRegistrations = safeConfig.owners.filter(
				(owner) => !publicKeys[owner],
			);
			return {
				enabled: true,
				publicKeys: Object.values(publicKeys) as CryptoKey[],
				missingRegistrations,
			} as const;
		},
		enabled: !!maybeSafeConfig?.owners?.length,
		staleTime: 15 * 1000,
		refetchInterval: 30 * 1000,
		throwOnError: true,
	});
}

export { useEncryptionPublicKeys };
