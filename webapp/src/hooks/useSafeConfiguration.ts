import type { SafeConfiguration } from "@/lib/contract";
import { SAFE_CONFIG_FETCHER_ABI, SAFE_CONFIG_FETCHER_ADDRESS } from "@/lib/contract";
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { Contract, JsonRpcProvider } from "ethers";
import type { JsonFragment } from "ethers";

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
			const provider = new JsonRpcProvider(rpcUrl);
			const contract = new Contract(
				SAFE_CONFIG_FETCHER_ADDRESS,
				SAFE_CONFIG_FETCHER_ABI as unknown as readonly JsonFragment[],
				provider,
			);
			const result = (await contract.getFullConfiguration(safeAddress, maxIterations, pageSize)) as [
				SafeConfiguration,
				string,
			];
			const [fullConfig, nextCursor] = result;
			return { fullConfig, nextCursor };
		},
		enabled: Boolean(rpcUrl && safeAddress),
		retry: false,
	});
}
