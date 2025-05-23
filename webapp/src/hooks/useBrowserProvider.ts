import { useConnectWallet } from "@web3-onboard/react";
import { BrowserProvider } from "ethers";
import { useMemo } from "react";

export function useBrowserProvider(): BrowserProvider | undefined {
	const [{ wallet }] = useConnectWallet();

	return useMemo(() => {
		if (!wallet) return undefined;
		return new BrowserProvider(wallet.provider);
	}, [wallet]);
}
