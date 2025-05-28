import { useQuery } from "@tanstack/react-query";
import type { JsonRpcApiProvider } from "ethers";

export function useNativeBalance(provider: JsonRpcApiProvider, safeAddress: string) {
	return useQuery<bigint, Error>({
		queryKey: ["nativeBalance", safeAddress],
		queryFn: () => provider.getBalance(safeAddress),
		enabled: Boolean(provider && safeAddress),
	});
}
