import type { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async ({ getNamedAccounts, deployments }) => {
	const { deterministic, log } = deployments;
	const { deployer } = await getNamedAccounts();

	const result = await deterministic("SafeInternationalHarbour", {
		from: deployer,
		args: ["0x4337084d9e255ff0702461cf8895ce9e3b5ff108"],
		log: true,
	});

	await result.deploy();

	log(`SafeInternationalHarbour deployed at ${result.address}`);
};

export default func;
func.tags = ["SafeInternationalHarbour"];
