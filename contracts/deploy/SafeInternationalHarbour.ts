import type { DeployFunction } from "hardhat-deploy/types";
import { harbourConfig } from "../config/harbourConfig";
import { build4337Config } from "../test/utils/erc4337";
import { buildQuotaConfig } from "../test/utils/quota";

const func: DeployFunction = async ({ getNamedAccounts, deployments, getChainId }) => {
	const { deterministic, log } = deployments;
	const { deployer } = await getNamedAccounts();
	const chainId = await getChainId();
	const config = harbourConfig[chainId];
	if (!config) throw Error("No configuration for this network");

	const result = await deterministic("SafeInternationalHarbour", {
		from: deployer,
		args: [build4337Config(config.erc4337config), buildQuotaConfig(config.quotaConfig)],
		log: true,
	});

	await result.deploy();

	log(`SafeInternationalHarbour deployed at ${result.address}`);
};

export default func;
func.tags = ["SafeInternationalHarbour"];
