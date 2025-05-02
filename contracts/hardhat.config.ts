import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-deploy";
import "hardhat-gas-reporter";
import "@nomiclabs/hardhat-etherscan";
import * as dotenv from "dotenv";
import { getSingletonFactoryInfo } from "@safe-global/safe-singleton-factory/dist";

dotenv.config();

const { RPC_URL, PRIVATE_KEY, MNEMONIC, ETHERSCAN_API_KEY } = process.env;
const accounts = PRIVATE_KEY
  ? [PRIVATE_KEY]
  : MNEMONIC
  ? { mnemonic: MNEMONIC }
  : undefined;

const SOLC_CONFIGURATION = (viaIR = true) => ({
  version: '0.8.29',
  settings: {
    optimizer: {
      enabled: true,
      runs: 10_000_000
    },
    viaIR
  }
});

const MAIN_SOLC_CONFIGURATION = SOLC_CONFIGURATION();
const SOLC_CONFIGURATION_WITHOUT_IR_PIPELINE = SOLC_CONFIGURATION(false);

const config: HardhatUserConfig = {
	networks: {
		hardhat: {
			allowUnlimitedContractSize: true,
		},
	},
	paths: {
		sources: "./src/",
	},
	solidity: {
		compilers: [
			MAIN_SOLC_CONFIGURATION,
		],
		overrides: {
			// We need to specify both the SafeModuleHarbour and the Safe contract,
			// because the Safe contract is imported by the SafeModuleHarbour contract.
			"src/module/SafeModuleHarbour.sol": SOLC_CONFIGURATION_WITHOUT_IR_PIPELINE,
			"@safe-global/safe-contracts/contracts/Safe.sol": SOLC_CONFIGURATION_WITHOUT_IR_PIPELINE,
		}
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
	},
	deterministicDeployment: (chainId) => {
		const info = getSingletonFactoryInfo(parseInt(chainId));
		if (!info) {
			throw new Error(`\nSafe factory not found for network ${chainId}. You can request a new deployment at https://github.com/safe-global/safe-singleton-factory.\n`);
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

export default config;
