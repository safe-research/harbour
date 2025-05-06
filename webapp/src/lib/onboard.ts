import injectedModule from "@web3-onboard/injected-wallets";
import { init } from "@web3-onboard/react";

const injected = injectedModule();

init({
	wallets: [injected],
	chains: [
		{
			id: "0x2105",
			token: "ETH",
			label: "Base",
			rpcUrl: "https://mainnet.base.org",
		},
	],
	connect: {
		autoConnectLastWallet: true,
	},
	accountCenter: {
		desktop: { enabled: true, position: "bottomRight" },
		mobile: { enabled: true, position: "bottomRight" },
	},
});
