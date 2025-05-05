import type { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async ({ getNamedAccounts, deployments }) => {
	const { deterministic, log } = deployments;
	const { deployer } = await getNamedAccounts();

	const result = await deterministic("SafeConfigurationFetcher", {
		from: deployer,
		args: [],
		log: true,
	});

	await result.deploy();

	log(`SafeConfigurationFetcher deployed at ${result.address}`);
};

export default func;
func.tags = ["SafeConfigurationFetcher"];
