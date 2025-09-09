import type { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async ({ getNamedAccounts, deployments }) => {
	const { deterministic, log } = deployments;
	const { deployer } = await getNamedAccounts();

	const harbourDeployment = await deterministic("SafeSecretHarbour", {
		from: deployer,
		log: true,
	});

	await harbourDeployment.deploy();

	log(`SafeSecretHarbour deployed at ${harbourDeployment.address}`);
};

export default func;
func.tags = ["SafeSecretHarbour"];
