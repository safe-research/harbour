import { getAddress, parseEther, parseUnits, type Signer } from "ethers";
import type { ActionType, TaskArguments } from "hardhat/types";
import { ERC20__factory, SafeHarbourPaymaster__factory } from "../../typechain-types";

export const fundPaymaster: ActionType<TaskArguments> = async (taskArgs, hre) => {
	const [hardhatSigner] = await hre.ethers.getSigners();
	const signer = hardhatSigner as unknown as Signer;
	console.log(`Use ${hardhatSigner.address} for signing`);
	const paymasterAddress = taskArgs.paymaster
		? getAddress(taskArgs.paymaster)
		: (await hre.deployments.get("SafeHarbourPaymaster")).address;
	console.log(`Use Paymaster at ${paymasterAddress}`);
	const paymaster = SafeHarbourPaymaster__factory.connect(paymasterAddress, signer);
	const result = await paymaster.deposit({ value: parseEther(taskArgs.amount) });
	console.log(result.hash);
};

export const depositValidatorTokens: ActionType<TaskArguments> = async (taskArgs, hre) => {
	const [hardhatSigner] = await hre.ethers.getSigners();
	const signer = hardhatSigner as unknown as Signer;
	console.log(`Use ${hardhatSigner.address} for funding`);
	const paymasterAddress = taskArgs.paymaster
		? getAddress(taskArgs.paymaster)
		: (await hre.deployments.get("SafeHarbourPaymaster")).address;
	console.log(`Use Paymaster at ${paymasterAddress}`);
	const paymaster = SafeHarbourPaymaster__factory.connect(paymasterAddress, signer);
	const feeTokenAddress = await paymaster.FEE_TOKEN();
	console.log(`Use Fee Token at ${feeTokenAddress}`);
	const validatorAddress = taskArgs.validator ? getAddress(taskArgs.validator) : hardhatSigner.address;
	console.log(`For Validator ${validatorAddress}`);
	const feeToken = ERC20__factory.connect(feeTokenAddress, signer);
	const decimals = await feeToken.decimals();
	const amount = parseUnits(taskArgs.amount, decimals);
	const approval = await feeToken.allowance(hardhatSigner.address, paymaster);
	if (approval < amount) {
		const approveTx = await feeToken.approve(paymaster, amount - approval);
		console.log(`Approval Tx: ${approveTx.hash}`);
		await approveTx.wait();
		console.log("Approval done");
	}
	const depositTx = await paymaster.depositTokensForSigner(validatorAddress, amount);
	console.log(`Deposit Tx: ${depositTx.hash}`);
	await depositTx.wait();
	console.log("Deposit done");
};
