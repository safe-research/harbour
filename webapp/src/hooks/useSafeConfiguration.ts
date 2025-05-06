import type { SafeConfiguration } from "@/lib/contract";
import { SAFE_CONFIG_FETCHER_ABI, SAFE_CONFIG_FETCHER_ADDRESS } from "@/lib/contract";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { http, createPublicClient } from "viem";

export interface SafeConfigResult {
	fullConfig: SafeConfiguration;
	nextCursor: string;
}

interface Options {
	pageSize?: number;
	maxIterations?: number;
}

export function useSafeConfiguration(
	rpcUrl: string,
	safeAddress: string,
	options: Options = {},
): UseQueryResult<SafeConfigResult, Error> {
	const { pageSize = 50, maxIterations = 10 } = options;

	return useQuery<SafeConfigResult, Error>({
		queryKey: ["safeConfig", rpcUrl, safeAddress, pageSize, maxIterations],
		queryFn: async () => {
			const client = createPublicClient({ transport: http(rpcUrl) });
			const result = (await client.readContract({
				address: SAFE_CONFIG_FETCHER_ADDRESS,
				abi: SAFE_CONFIG_FETCHER_ABI,
				functionName: "getFullConfiguration",
				args: [safeAddress, maxIterations, pageSize],
			})) as [SafeConfiguration, string];
			const [fullConfig, nextCursor] = result;
			return { fullConfig, nextCursor };
		},
		enabled: Boolean(rpcUrl && safeAddress),
		retry: false,
	});
}
