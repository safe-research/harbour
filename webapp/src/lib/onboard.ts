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
