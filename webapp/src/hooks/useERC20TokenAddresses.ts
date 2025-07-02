import { useCallback, useState } from "react";
import {
	addERC20TokenAddress,
	getERC20TokenAddresses,
	removeERC20TokenAddress,
} from "@/lib/localStorage";

/**
 * Hook to manage ERC20 token addresses persisted in localStorage by chain ID.
 * Provides current addresses for a specific chain and functions to add/remove addresses.
 */
function useERC20TokenAddresses(chainId: number) {
	const [addresses, setAddresses] = useState<string[]>(() =>
		getERC20TokenAddresses(chainId),
	);

	const addAddress = useCallback(
		(address: string) => {
			addERC20TokenAddress(address, chainId);
			setAddresses(getERC20TokenAddresses(chainId));
		},
		[chainId],
	);

	const removeAddress = useCallback(
		(address: string) => {
			removeERC20TokenAddress(address, chainId);
			setAddresses(getERC20TokenAddresses(chainId));
		},
		[chainId],
	);

	// Update addresses when chainId changes
	const refreshAddresses = useCallback(() => {
		setAddresses(getERC20TokenAddresses(chainId));
	}, [chainId]);

	// Effect to refresh addresses when chainId changes
	useState(() => {
		refreshAddresses();
	});

	return { addresses, addAddress, removeAddress, refreshAddresses };
}

export { useERC20TokenAddresses };
