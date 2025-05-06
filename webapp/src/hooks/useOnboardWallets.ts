import { onboard } from "@/lib/onboard";
import type { WalletState } from "@web3-onboard/core";
import { useEffect, useState } from "react";

export function useOnboardWallets(): WalletState[] {
	const [wallets, setWallets] = useState<WalletState[]>(() => onboard.state.get().wallets);

	useEffect(() => {
		const wallets$ = onboard.state.select("wallets");
		const { unsubscribe } = wallets$.subscribe((walletList) => {
			setWallets(walletList);
		});
		return unsubscribe;
	}, []);

	return wallets;
}
