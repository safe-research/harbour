import type { DeployFunction } from "hardhat-deploy/types";
import { harbourConfigs } from "../config/harbourConfigs";
import { paymasterConfigs } from "../config/paymasterConfigs";
import { build4337Config } from "../test/utils/erc4337";
import { buildQuotaConfig } from "../test/utils/quota";
import { buildSlashingConfig } from "../test/utils/slashing";

const func: DeployFunction = async ({ getNamedAccounts, deployments, getChainId }) => {
	const { deterministic, log } = deployments;
	const { deployer } = await getNamedAccounts();
	const chainId = await getChainId();
	const harbourConfig = harbourConfigs[chainId];
	const paymasterConfig = paymasterConfigs[chainId];
	if (!harbourConfig || !paymasterConfig) throw Error("No configuration for this network");

	const paymasterDeployment = await deterministic("SafeHarbourPaymaster", {
		from: deployer,
		args: [
			deployer,
			paymasterConfig.erc4337entryPoint,
			buildQuotaConfig(paymasterConfig.quotaConfig),
			buildSlashingConfig(paymasterConfig.slashingConfig),
		],
		log: true,
	});
	await paymasterDeployment.deploy();

	log(`SafeHarbourPaymaster deployed at ${paymasterDeployment.address}`);

	const harbourDeployment = await deterministic("SafeInternationalHarbour", {
		from: deployer,
		args: [
			build4337Config({
				...harbourConfig.erc4337config,
			}),
			buildQuotaConfig(harbourConfig.quotaConfig),
		],
		log: true,
	});

	await harbourDeployment.deploy();

	log(`SafeInternationalHarbour deployed at ${harbourDeployment.address}`);
};

export default func;
func.tags = ["SafeInternationalHarbour"];
