import {
	getMultiSendCallOnlyDeployment,
	getProxyFactoryDeployment,
	getSafeSingletonDeployment,
} from "@safe-global/safe-deployments";
import { getSafeModuleSetupDeployment } from "@safe-global/safe-modules-deployments";
import { hexlify, randomBytes } from "ethers";
import type { Contract } from "ethers";
import { ethers } from "hardhat";

const SAFE_DEPLOYMENTS_PER_TRANSACTION = 20;

type MultisendCall = {
	to: string;
	value: bigint;
	data: string;
};

const encodeMetaTransaction = (tx: MultisendCall): string => {
	const data = ethers.getBytes(tx.data);
	const encoded = ethers.solidityPacked(
		["uint8", "address", "uint256", "uint256", "bytes"],
		[0, tx.to, tx.value, data.length, data],
	);
	return encoded.slice(2);
};

export const encodeMultiSend = (calls: MultisendCall[]): string => {
	return `0x${calls.map((tx) => encodeMetaTransaction(tx)).join("")}`;
};

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
	const modulesSetupAddress = modulesDep.networkAddresses[chainId];
	console.log(`SafeModulesSetup address: ${modulesSetupAddress}`);

	const multiSendCallOnlyDeployment = getMultiSendCallOnlyDeployment({
		network: chainId,
	});
	if (!multiSendCallOnlyDeployment) {
		throw new Error(`MultiSendCallOnly deployment not found for network ${chainId}`);
	}
	const multiSendCallOnlyAddress = multiSendCallOnlyDeployment.defaultAddress;
	console.log(`MultiSendCallOnly address: ${multiSendCallOnlyAddress}`);

	// Signer
	const [deployer] = await ethers.getSigners();
	console.log(`Deployer: ${deployer.address}`);

	// Build owner list (1 from mnemonic + 20 random)
	const owners: string[] = [deployer.address];
	for (let i = 0; i < 20; i++) {
		owners.push(hexlify(randomBytes(20)));
	}
	console.log("Owners:", owners);

	// Parameters
	const threshold = 1;
	const modules = Array.from({ length: 15 }, () => hexlify(randomBytes(20)));
	const fallbackHandler = hexlify(randomBytes(20));
	const guard = await ethers.getContractFactory("DebugTransactionGuard").then((f) => f.deploy());
	const guardAddress = await guard.getAddress();
	console.log("Modules:", modules);
	console.log("Fallback handler:", fallbackHandler);
	console.log("Guard:", guardAddress);

	// Attach the factory
	const proxyFactory = await ethers.getContractAt("SafeProxyFactory", proxyFactoryAddress, deployer);
	const SafeFactory = await ethers.getContractFactory("Safe");
	const multisendContract = new ethers.Contract(multiSendCallOnlyAddress, multiSendCallOnlyDeployment.abi, deployer);

	const safeCreations: MultisendCall[] = [];

	for (let i = 0; i < SAFE_DEPLOYMENTS_PER_TRANSACTION; i++) {
		// Build initializer for Safe.setup, with inline modulesSetup call
		// Prepare modules setup calldata
		const modulesSetupContract = new ethers.Contract(modulesSetupAddress, modulesDep.abi, deployer);
		const modulesSetupCalldata = modulesSetupContract.interface.encodeFunctionData("enableModules", [modules]);
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
		const txCreate = proxyFactory.interface.encodeFunctionData("createProxyWithNonce", [
			safeSingletonAddress,
			initializer,
			saltNonce,
		]);
		safeCreations.push({
			to: proxyFactoryAddress,
			value: 0n,
			data: txCreate,
		});
	}
	const multisendTx = await multisendContract.multisend(encodeMultiSend(safeCreations));
	const receipt = await multisendTx.wait(5);
	if (!receipt) {
		throw new Error("multisend transaction has no receipt");
	}
	const creationEvents = await proxyFactory.queryFilter(proxyFactory.filters.ProxyCreation(), receipt.blockNumber);
	console.log("Creation event:", creationEvents);
	const proxyAddress = creationEvents[0].args.proxy;
	console.log(`Safe proxy deployed at: ${proxyAddress}`);

	// Modules enabled as part of proxy setup

	// Set guard on the Safe proxy via execTransaction
	const safeProxy = await ethers.getContractAt("Safe", proxyAddress, deployer);
	const setGuardData = safeProxy.interface.encodeFunctionData("setGuard", [guardAddress]);
	const txHashGuard = await safeProxy.getTransactionHash(
		proxyAddress,
		0,
		setGuardData,
		0,
		0,
		0,
		0,
		ethers.ZeroAddress,
		ethers.ZeroAddress,
		0,
	);
	const hashBytesGuard = ethers.getBytes(txHashGuard);
	const flatSigGuard = (await deployer.signMessage(hashBytesGuard)).replace(/1b$/, "1f").replace(/1c$/, "20");
	const txGuardExec = await safeProxy.execTransaction(
		proxyAddress,
		0,
		setGuardData,
		0,
		0,
		0,
		0,
		ethers.ZeroAddress,
		ethers.ZeroAddress,
		flatSigGuard,
	);
	await txGuardExec.wait(5);
	console.log("Guard set");

	console.log("✅ Safe account ready at:", proxyAddress);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
