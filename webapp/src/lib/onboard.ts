import injectedModule from "@web3-onboard/injected-wallets";
import { init } from "@web3-onboard/react";

const injected = injectedModule();

init({
	wallets: [injected],
	chains: [],
	connect: {
		autoConnectLastWallet: true,
	},
	accountCenter: {
		desktop: { enabled: true, position: "bottomRight" },
		mobile: { enabled: true, position: "bottomRight" },
	},
});
