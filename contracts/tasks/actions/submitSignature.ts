import { getAddress, parseEther, parseUnits, type Signer } from "ethers";
import type { ActionType, EthereumProvider, TaskArguments } from "hardhat/types";
import { buildSafeTx, buildSignedUserOp, encodePaymasterData } from "../../test/utils/erc4337";
import { addValidatorSignature } from "../../test/utils/quota";
import {
	EntryPoint__factory,
	ERC20__factory,
	SafeHarbourPaymaster__factory,
	SafeInternationalHarbour__factory,
} from "../../typechain-types";
import { getUserOpGasLimits, getUserOpGasPrice, sendUserOp, setGasParams } from "./utils/bundlers";

export const submitSignature: ActionType<TaskArguments> = async (taskArgs, hre) => {
	const [hardhatSigner] = await hre.ethers.getSigners();
	const signer = hardhatSigner as unknown as Signer;
	console.log(`Use ${hardhatSigner.address} for signing`);
	const harbourAddress = taskArgs.harbour
		? getAddress(taskArgs.harbour)
		: (await hre.deployments.get("SafeInternationalHarbour")).address;
	console.log(`Use Harbour at ${harbourAddress}`);
	const safeAddress = getAddress(taskArgs.safe);
	const harbourChainId = (await hre.ethers.provider.getNetwork()).chainId;
	const safeTxChainId = taskArgs.chainId ?? harbourChainId;
	const safeTx = buildSafeTx(taskArgs.tx);
	console.log({ safeTx });
	const harbour = SafeInternationalHarbour__factory.connect(harbourAddress, signer);
	const supportedEntryPoint = await harbour.SUPPORTED_ENTRYPOINT();
	const paymasterAddress = await harbour.TRUSTED_PAYMASTER();
	const paymaster = SafeHarbourPaymaster__factory.connect(paymasterAddress, signer);
	let paymasterAndData: string | undefined;
	if (taskArgs.asPaymaster) {
		console.log(`Use Paymaster at ${paymasterAddress}`);
		paymasterAndData = await encodePaymasterData({ paymaster });
	}
	const { userOp, signature } = await buildSignedUserOp(
		harbour,
		signer,
		safeTxChainId,
		safeAddress,
		safeTx,
		paymasterAndData,
	);
	if (taskArgs.asPaymaster) {
		// For estimation the user signature is used ... only works for estimation
		userOp.signature = signature;
	}
	const gasFee = await getUserOpGasPrice(hre.ethers.provider as unknown as EthereumProvider);
	const limits = await getUserOpGasLimits(supportedEntryPoint, userOp, gasFee);
	userOp.signature = "0x";
	setGasParams(userOp, gasFee, limits);
	if (taskArgs.asPaymaster) {
		userOp.paymasterAndData = await encodePaymasterData({ 
			paymaster, 
			paymasterVerificationGas: BigInt(limits.paymasterVerificationGasLimit), 
		});
		await addValidatorSignature(harbourChainId, EntryPoint__factory.connect(supportedEntryPoint), userOp, signer);
	}
	const userOpHash = await sendUserOp(supportedEntryPoint, userOp);
	console.log({ userOpHash });
};

export const fundPaymaster: ActionType<TaskArguments> = async (taskArgs, hre) => {
	const [hardhatSigner] = await hre.ethers.getSigners();
	const signer = hardhatSigner as unknown as Signer;
	console.log(`Use ${hardhatSigner.address} for signing`);
	const harbourAddress = taskArgs.harbour
		? getAddress(taskArgs.harbour)
		: (await hre.deployments.get("SafeInternationalHarbour")).address;
	console.log(`Use Harbour at ${harbourAddress}`);
	const harbour = SafeInternationalHarbour__factory.connect(harbourAddress, signer);
	const paymasterAddress = await harbour.TRUSTED_PAYMASTER();
	console.log(`Use Paymaster at ${paymasterAddress}`);
	const paymaster = SafeHarbourPaymaster__factory.connect(paymasterAddress, signer);
	const result = await paymaster.deposit({ value: parseEther(taskArgs.amount) });
	console.log(result.hash);
};

export const depositValidatorTokens: ActionType<TaskArguments> = async (taskArgs, hre) => {
	const [hardhatSigner] = await hre.ethers.getSigners();
	const signer = hardhatSigner as unknown as Signer;
	console.log(`Use ${hardhatSigner.address} for funding`);
	const harbourAddress = taskArgs.harbour
		? getAddress(taskArgs.harbour)
		: (await hre.deployments.get("SafeInternationalHarbour")).address;
	console.log(`Use Harbour at ${harbourAddress}`);
	const harbour = SafeInternationalHarbour__factory.connect(harbourAddress, signer);
	const paymasterAddress = await harbour.TRUSTED_PAYMASTER();
	console.log(`Use Paymaster at ${paymasterAddress}`);
	const paymaster = SafeHarbourPaymaster__factory.connect(paymasterAddress, signer);
	const feeTokenAddress = await paymaster.FEE_TOKEN();
	console.log(`Use Fee Token at ${feeTokenAddress}`);
	const validatorAddress = taskArgs.validator ? getAddress(taskArgs.validator) : hardhatSigner.address
	console.log(`For Validator ${validatorAddress}`);
	const feeToken = ERC20__factory.connect(feeTokenAddress, signer);
	const decimals = await feeToken.decimals();
	const amount = parseUnits(taskArgs.amount, decimals);
	const approval = await feeToken.allowance(hardhatSigner.address, paymaster);
	if (approval < amount) {
		const approveTx = await feeToken.approve(paymaster, amount - approval);
		console.log(`Approval Tx: ${approveTx.hash}`);
		await approveTx.wait()
		console.log(`Approval done`);
	}
	const depositTx = await paymaster.depositTokensForSigner(validatorAddress, amount);
	console.log(`Deposit Tx: ${depositTx.hash}`);
	await depositTx.wait()
	console.log(`Deposit done`);
};
