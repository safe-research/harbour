import { useEffect, useState } from "react";
import { JsonRpcProvider } from "ethers";
import type { JsonRpcApiProvider } from "ethers";
import { getRpcUrlByChainId } from "../lib/chains";

interface UseChainlistRpcProviderResult {
	provider: JsonRpcApiProvider | null;
	error: Error | null;
	isLoading: boolean;
}

export function useChainlistRpcProvider(chainId: number): UseChainlistRpcProviderResult {
	const [provider, setProvider] = useState<JsonRpcApiProvider | null>(null);
	const [error, setError] = useState<Error | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(true);

	useEffect(() => {
		setIsLoading(true);
		setError(null);
		setProvider(null);

		(async () => {
			try {
				const url = await getRpcUrlByChainId(chainId);
				setProvider(new JsonRpcProvider(url));
			} catch (e) {
				if (e instanceof Error) {
					setError(e);
				} else {
					setError(new Error("Unknown error occurred while fetching RPC URL"));
				}
			} finally {
				setIsLoading(false);
			}
		})();
	}, [chainId]);

	return { provider, error, isLoading };
}
