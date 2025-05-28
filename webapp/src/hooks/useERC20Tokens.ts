import { type ERC20TokenDetails, fetchBatchERC20TokenDetails } from "@/lib/erc20";
import type { JsonRpcApiProvider } from "ethers";
import { useCallback, useEffect, useState } from "react";
import { useERC20TokenAddresses } from "./useERC20TokenAddresses";

/**
 * Hook to fetch ERC20 token details for addresses managed in localStorage.
 * @param provider JSON-RPC provider
 * @param safeAddress Safe contract address for balance lookup
 */
function useERC20Tokens(provider?: JsonRpcApiProvider, safeAddress?: string) {
	const { addresses, addAddress, removeAddress } = useERC20TokenAddresses();
	const [tokens, setTokens] = useState<ERC20TokenDetails[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const fetchDetails = useCallback(async () => {
		if (!provider || !safeAddress) return;
		setIsLoading(true);
		setError(null);
		try {
		   if (addresses.length === 0) {
			   setTokens([]);
			   return;
		   }
		   // Batch fetch via multicall
		   const results = await fetchBatchERC20TokenDetails(provider, addresses, safeAddress);
		   // Filter out nulls
		   const fetched = results.filter((r): r is ERC20TokenDetails => r !== null);
		   setTokens(fetched);
		   if (fetched.length !== addresses.length) {
			   setError(
				   "Some ERC20 token details could not be fetched. They may have been removed or the contract address is invalid.",
			   );
		   }
		} catch (err) {
			console.error("Error fetching ERC20 tokens", err);
			setError("Failed to load ERC20 tokens.");
			setTokens([]);
		} finally {
			setIsLoading(false);
		}
	}, [provider, safeAddress, addresses]);

	useEffect(() => {
		fetchDetails();
	}, [fetchDetails]);

	return { tokens, isLoading, error, addAddress, removeAddress, refresh: fetchDetails };
}

export { useERC20Tokens };
