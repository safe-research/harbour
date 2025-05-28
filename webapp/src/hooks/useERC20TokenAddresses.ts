import { addERC20TokenAddress, getERC20TokenAddresses, removeERC20TokenAddress } from "@/lib/localStorage";
import { useCallback, useState } from "react";

/**
 * Hook to manage ERC20 token addresses persisted in localStorage.
 * Provides current addresses and functions to add/remove addresses.
 */
function useERC20TokenAddresses() {
	const [addresses, setAddresses] = useState<string[]>(() => getERC20TokenAddresses());

	const addAddress = useCallback((address: string) => {
		addERC20TokenAddress(address);
		setAddresses(getERC20TokenAddresses());
	}, []);

	const removeAddress = useCallback((address: string) => {
		removeERC20TokenAddress(address);
		setAddresses(getERC20TokenAddresses());
	}, []);

	return { addresses, addAddress, removeAddress };
}

export { useERC20TokenAddresses };
