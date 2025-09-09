import { ethers } from "hardhat";
import { describeBench } from "./utils/bench";
import { build4337Config, buildSignedUserOp, encodePaymasterData } from "./utils/erc4337";
import { addValidatorSignature, buildQuotaConfig } from "./utils/quota";
import { buildSlashingConfig } from "./utils/slashing";

describeBench(
	"SafeInternationalHarbour.Paymaster",
	async ([bob, validator]) => {
		const EntryPointFactory = await ethers.getContractFactory("EntryPoint");
		const entryPoint = await EntryPointFactory.deploy();
		const { chainId: entryPointChainId } = await ethers.provider.getNetwork();

		const TestTokenFactory = await ethers.getContractFactory("TestToken");
		const testToken = await TestTokenFactory.deploy();

		const PaymasterFactory = await ethers.getContractFactory("SafeHarbourPaymaster");
		const paymaster = await PaymasterFactory.deploy(
			bob,
			entryPoint,
			buildQuotaConfig({
				maxAvailableQuota: 0,
				quotaPerFeeToken: 1_000,
				quotaPerFeeTokenScale: 0,
				feeToken: await testToken.getAddress(),
			}),
			buildSlashingConfig(),
		);
		await paymaster.deposit({ value: ethers.parseEther("1") });
		await testToken.approve(paymaster, ethers.parseUnits("1", 18));
		await paymaster.depositTokensForSigner(validator, ethers.parseUnits("1", 18));

		const paymasterAndData = await encodePaymasterData({ paymaster });
		const gasFee = {
			maxFeePerGas: 0xb00n,
			maxPriorityFeePerGas: 0xf4240n,
		};

		const HarbourFactory = await ethers.getContractFactory("SafeInternationalHarbour");
		const erc4337config = build4337Config({ entryPoint: await entryPoint.getAddress() });
		const harbour = await HarbourFactory.deploy(erc4337config);

		return { entryPoint, entryPointChainId, harbour, gasFee, paymasterAndData, validator };
	},
	async ({
		deployer,
		signer,
		entryPoint,
		entryPointChainId,
		harbour,
		chainId,
		safe,
		safeTx,
		paymasterAndData,
		gasFee,
		validator,
	}) => {
		const { userOp } = await buildSignedUserOp(harbour, signer, chainId, safe, safeTx, paymasterAndData, gasFee);
		await addValidatorSignature(entryPointChainId, entryPoint, userOp, validator);
		return await entryPoint.handleOps([userOp], deployer);
	},
);
