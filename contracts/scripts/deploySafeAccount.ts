#!/usr/bin/env ts-node
// @ts-nocheck

// @ts-ignore: missing types for safe-deployments
import { getProxyFactoryDeployment, getSafeSingletonDeployment } from "@safe-global/safe-deployments";
import { getSafeModuleSetupDeployment } from "@safe-global/safe-modules-deployments";
import { hexlify, randomBytes } from "ethers";
import { ethers } from "hardhat";

/**
 * Deploy a new Safe proxy using existing deployments:
 * - singleton & proxy factory from @safe-global/safe-deployments
 * - modules setup via SafeModulesSetup contract
 */
async function main() {
	// Determine network
	const network = await ethers.provider.getNetwork();
	const chainId = network.chainId.toString();

	// Fetch existing Safe singleton
	const safeDep = getSafeSingletonDeployment({ network: chainId });
	if (!safeDep) {
		throw new Error(`Safe singleton deployment not found for network ${chainId}`);
	}
	const safeSingletonAddress = safeDep.defaultAddress;
	console.log(`Safe singleton address: ${safeSingletonAddress}`);

	// Fetch existing SafeProxyFactory
	const proxyDep = getProxyFactoryDeployment({ network: chainId });
	if (!proxyDep) {
		throw new Error(`SafeProxyFactory deployment not found for network ${chainId}`);
	}
	const proxyFactoryAddress = proxyDep.defaultAddress;
	console.log(`SafeProxyFactory address: ${proxyFactoryAddress}`);

	// Fetch SafeModulesSetup
	const modulesDep = getSafeModuleSetupDeployment({ network: chainId });
	if (!modulesDep) {
		throw new Error(`SafeModulesSetup deployment not found for network ${chainId}`);
	}
	const modulesSetupAddress = modulesDep.defaultAddress;
	console.log(`SafeModulesSetup address: ${modulesSetupAddress}`);

	// Signer
	const [deployer] = await ethers.getSigners();
	console.log(`Deployer: ${deployer.address}`);

	// Build owner list (1 from mnemonic + 14 random)
	const owners: string[] = [deployer.address];
	for (let i = 0; i < 14; i++) {
		owners.push(hexlify(randomBytes(20)));
	}
	console.log("Owners:", owners);

	// Parameters
	const threshold = 1;
	const modules = Array.from({ length: 10 }, () => hexlify(randomBytes(20)));
	const fallbackHandler = hexlify(randomBytes(20));
	const guard = hexlify(randomBytes(20));
	console.log("Modules:", modules);
	console.log("Fallback handler:", fallbackHandler);
	console.log("Guard:", guard);

	// Attach the factory
	const proxyFactory = await ethers.getContractAt("SafeProxyFactory", proxyFactoryAddress, deployer);

	// Build initializer for Safe.setup, with inline modulesSetup call
	const SafeFactory = await ethers.getContractFactory("Safe");
	// Prepare modules setup calldata
	const ModulesSetupFactory = await ethers.getContractFactory("SafeModulesSetup");
	const modulesSetupInterface = ModulesSetupFactory.interface;
	const modulesSetupCalldata = modulesSetupInterface.encodeFunctionData("setupModules", [modules]);
	const initializer = SafeFactory.interface.encodeFunctionData("setup", [
		owners,
		threshold,
		modulesSetupAddress, // to: SafeModulesSetup contract
		modulesSetupCalldata, // data: call to setupModules(modules)
		fallbackHandler,
		ethers.ZeroAddress, // payment token
		0, // payment
		ethers.ZeroAddress, // payment receiver
	]);

	// Create the proxy
	const saltNonce = Date.now();
	const txCreate = await proxyFactory.createProxyWithNonce(safeSingletonAddress, initializer, saltNonce);
	const receipt = await txCreate.wait();
	if (!receipt) {
		throw new Error("createProxyWithNonce transaction has no receipt");
	}
	const [creationEvent] = await proxyFactory.queryFilter(proxyFactory.filters.ProxyCreation(), receipt.blockNumber);
	const proxyAddress = creationEvent.args.proxy;
	console.log(`Safe proxy deployed at: ${proxyAddress}`);

	// Modules enabled as part of proxy setup

	// Set guard on the Safe proxy
	const safeProxy = await ethers.getContractAt("Safe", proxyAddress, deployer);
	const txGuard = await safeProxy.setGuard(guard);
	await txGuard.wait();
	console.log("Guard set");

	console.log("✅ Safe account ready at:", proxyAddress);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
