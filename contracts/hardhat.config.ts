import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-dependency-compiler";
import "hardhat-deploy";
import "hardhat-gas-reporter";

const config: HardhatUserConfig = {
	paths: {
		sources: "./src/",
	},
  solidity: {
    compilers: [
      {
        version: '0.8.29',
        settings: {
          optimizer: {
            enabled: true,
            runs: 10_000_000
          },
          viaIR: true
        }
      },
      {
        version: '0.7.6',
        settings: {
          optimizer: { enabled: false },
          viaIR: false
        }
      }
    ],
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
	dependencyCompiler: {
		paths: [
			"@safe-global/safe-contracts/contracts/proxies/SafeProxyFactory.sol",
		],
	},
	gasReporter: {
		enabled: true,
	},
};

export default config;
