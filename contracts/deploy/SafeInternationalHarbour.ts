import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async ({ getNamedAccounts, deployments }) => {
  const { deterministic, log } = deployments;
  const { deployer } = await getNamedAccounts();

  // Deploy SafeInternationalHarbour deterministically using CREATE2
  const result = await deterministic("SafeInternationalHarbour", {
    from: deployer,
    args: [],
    log: true,
  });

  // execute the deployment
  await result.deploy();

  log(`SafeInternationalHarbour deployed at ${result.address}`);
};

export default func;
func.tags = ["SafeInternationalHarbour"]; 