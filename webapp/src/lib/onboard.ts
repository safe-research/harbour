/**
 * @file Initializes Web3-Onboard for wallet connections.
 * This module configures and initializes the Web3-Onboard library with
 * support for injected wallets and specifies Gnosis Chain as the target network.
 * It also enables auto-connecting to the last used wallet.
 */
import injectedModule from "@web3-onboard/injected-wallets";
import { init } from "@web3-onboard/react";

const injected = injectedModule();

init({
	wallets: [injected],
	chains: [
		{
			id: "0x64",
			token: "XDAI",
			label: "Gnosis Chain",
			rpcUrl: "https://rpc.gnosischain.com",
		},
	],
	connect: {
		autoConnectLastWallet: true,
	},
});
