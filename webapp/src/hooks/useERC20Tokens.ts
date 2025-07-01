import { useQuery } from "@tanstack/react-query";
import type { JsonRpcApiProvider } from "ethers";
import {
	type ERC20TokenDetails,
	fetchBatchERC20TokenDetails,
} from "@/lib/erc20";
import { useERC20TokenAddresses } from "./useERC20TokenAddresses";

/**
 * Hook to fetch ERC20 token details for addresses managed in localStorage.
 * @param provider JSON-RPC provider
 * @param safeAddress Safe contract address for balance lookup
 */
/**
 * Hook to fetch ERC20 token details by addresses in localStorage for a given Safe and chain
 * @param provider JSON-RPC provider
 * @param safeAddress Safe contract address
 * @param chainId Chain identifier to re-run the query on network change
 */
function useERC20Tokens(
	provider: JsonRpcApiProvider,
	safeAddress: string,
	chainId: number,
) {
	const { addresses, addAddress, removeAddress } =
		useERC20TokenAddresses(chainId);
	const queryKey = ["erc20Tokens", safeAddress, chainId, addresses];
	const queryFn = async () => {
		if (
			!provider ||
			!safeAddress ||
			chainId == null ||
			addresses.length === 0
		) {
			return [] as ERC20TokenDetails[];
		}
		const results = await fetchBatchERC20TokenDetails(
			provider,
			addresses,
			safeAddress,
		);
		return results.filter((r): r is ERC20TokenDetails => r !== null);
	};
	const {
		data: tokens = [],
		isLoading,
		error: queryError,
		refetch,
	} = useQuery<ERC20TokenDetails[], Error>({
		queryKey,
		queryFn,
		enabled: !!provider && !!safeAddress && chainId != null,
	});
	const error = queryError ? queryError.message : null;
	return {
		tokens,
		isLoading,
		error,
		addAddress,
		removeAddress,
		refresh: refetch,
	};
}

export { useERC20Tokens };
