import { ethers } from "hardhat";
import { describeBench } from "./utils/bench";
import { build4337Config, buildSignedUserOp } from "./utils/erc4337";

describeBench(
	"SafeInternationalHarbour.4337",
	async () => {
		// TODO: use test token to include fee payment overhead
		const EntryPointFactory = await ethers.getContractFactory("EntryPoint");
		const entryPoint = await EntryPointFactory.deploy();

		const TestPaymasterFactory = await ethers.getContractFactory("TestPaymaster");
		const paymaster = await TestPaymasterFactory.deploy();
		const paymasterAddress = await paymaster.getAddress();
		const paymasterAndData = ethers.solidityPacked(["address", "uint128", "uint128"], [paymasterAddress, 500_000, 0]);

		const HarbourFactory = await ethers.getContractFactory("SafeInternationalHarbour");
		const erc4337config = build4337Config({ entryPoint: await entryPoint.getAddress() });
		const harbour = await HarbourFactory.deploy(erc4337config);

		return { entryPoint, harbour, paymasterAndData };
	},
	async ({ deployer, signer, entryPoint, harbour, chainId, safe, safeTx, paymasterAndData }) => {
		const { userOp } = await buildSignedUserOp(harbour, signer, chainId, safe, safeTx, paymasterAndData);
		return await entryPoint.handleOps([userOp], deployer.address);
	},
);
