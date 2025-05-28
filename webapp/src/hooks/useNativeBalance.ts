import { useQuery } from "@tanstack/react-query";
import type { JsonRpcApiProvider } from "ethers";

export function useNativeBalance(provider: JsonRpcApiProvider, safeAddress: string, chainId: number) {
	return useQuery<bigint, Error>({
		queryKey: ["nativeBalance", chainId, safeAddress],
		queryFn: () => provider.getBalance(safeAddress),
		enabled: Boolean(provider && safeAddress),
	});
}
