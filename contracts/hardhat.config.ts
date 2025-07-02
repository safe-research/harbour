import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-deploy";
import "@nomicfoundation/hardhat-verify";
import { getSingletonFactoryInfo } from "@safe-global/safe-singleton-factory/dist";
import * as dotenv from "dotenv";
import type { HttpNetworkUserConfig } from "hardhat/types";

import "./tasks/deployAndVerify";
import "./tasks/submitSignature";

dotenv.config();

const { RPC_URL, PRIVATE_KEY, MNEMONIC, ETHERSCAN_API_KEY } = process.env;
const accounts = PRIVATE_KEY ? [PRIVATE_KEY] : MNEMONIC ? { mnemonic: MNEMONIC } : undefined;
const DEFAULT_MNEMONIC = "test test test test test test test test test test test junk";

const sharedNetworkConfig: HttpNetworkUserConfig = {};
if (PRIVATE_KEY) {
	sharedNetworkConfig.accounts = [PRIVATE_KEY];
} else {
	sharedNetworkConfig.accounts = {
		mnemonic: MNEMONIC || DEFAULT_MNEMONIC,
	};
}

const SOLC_CONFIGURATION = (viaIR = true) => ({
	version: "0.8.29",
	settings: {
		optimizer: {
			enabled: true,
			runs: 10_000_000,
		},
		evmVersion: "cancun",
		viaIR,
	},
});

const MAIN_SOLC_CONFIGURATION = SOLC_CONFIGURATION();
const SOLC_CONFIGURATION_WITHOUT_IR_PIPELINE = SOLC_CONFIGURATION(false);

const config: HardhatUserConfig = {
	networks: {
		sepolia: {
			...sharedNetworkConfig,
			url: "https://sepolia.drpc.org",
		},
		gnosis: {
			...sharedNetworkConfig,
			url: "https://rpc.gnosischain.com",
		},
		hardhat: {
			allowUnlimitedContractSize: true,
		},
	},
	paths: {
		sources: "./src/",
	},
	solidity: {
		compilers: [MAIN_SOLC_CONFIGURATION],
		overrides: {
			"src/test/TestImports.sol": SOLC_CONFIGURATION_WITHOUT_IR_PIPELINE,
		},
	},
	typechain: {
		outDir: "./typechain-types",
		target: "ethers-v6",
	},
	gasReporter: {
		enabled: true,
	},
	etherscan: {
		apiKey: ETHERSCAN_API_KEY || "",
		customChains: [
			{
				network: "gnosis",
				chainId: 100,
				urls: {
					apiURL: "https://api.gnosisscan.io",
					browserURL: "https://gnosisscan.io",
				},
			},
		],
	},
	deterministicDeployment: (chainId) => {
		const info = getSingletonFactoryInfo(Number.parseInt(chainId));
		if (!info) {
			throw new Error(
				`\nSafe factory not found for network ${chainId}. You can request a new deployment at https://github.com/safe-global/safe-singleton-factory.\n`,
			);
		}
		return {
			factory: info.address,
			deployer: info.signerAddress,
			funding: String(BigInt(info.gasLimit) * BigInt(info.gasPrice)),
			signedTx: info.transaction,
		};
	},
	namedAccounts: {
		deployer: {
			default: 0,
		},
	},
};

if (RPC_URL && config.networks) {
	config.networks.custom = {
		url: RPC_URL,
		accounts,
	};
}

export default config;
