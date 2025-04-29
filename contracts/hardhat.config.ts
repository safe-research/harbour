import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-deploy";
import "hardhat-gas-reporter";

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
	networks: {
		hardhat: {
			allowUnlimitedContractSize: true,
		},
	},
	typechain: {
		outDir: "./typechain-types",
		target: "ethers-v6",
	},
	gasReporter: {
		enabled: true,
	},
};

export default config;
