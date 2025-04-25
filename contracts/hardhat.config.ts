import type { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-dependency-compiler";
import "hardhat-deploy";
import "hardhat-gas-reporter";

const config: HardhatUserConfig = {
	paths: {
		sources: "./src/",
	},
	solidity: "0.8.29",
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
