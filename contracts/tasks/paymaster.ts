import { task, types } from "hardhat/config";

// Example: npm exec hardhat fund-paymaster -- --network sepolia --amount 0.01
task("fund-paymaster", "Fund the paymaster on the 4337 entrypoint")
	.addParam("amount", "Amount the paymaster should be funded with", undefined, types.string)
	.addParam("paymaster", "Override paymaster contract address to use", undefined, types.string, true)
	.setAction(async (taskArgs, hre, runSuper) => {
		// We have to use a dynamic import, as typechain is not immediately available in tasks
		const { fundPaymaster } = await import("./actions/paymaster");
		await fundPaymaster(taskArgs, hre, runSuper);
	});

// Example: npm exec hardhat deposit-validator-tokens -- --network sepolia --amount 0.01
task("deposit-validator-tokens", "Deposits token to the paymaster for a validator")
	.addParam("amount", "Amount of tokens to deposit for the validator", undefined, types.string)
	.addParam(
		"validator",
		"Address of validator to deposit the tokens for (default: address of signer)",
		undefined,
		types.string,
		true,
	)
	.addParam("paymaster", "Override paymaster contract address to use", undefined, types.string, true)
	.setAction(async (taskArgs, hre, runSuper) => {
		// We have to use a dynamic import, as typechain is not immediately available in tasks
		const { depositValidatorTokens } = await import("./actions/paymaster");
		await depositValidatorTokens(taskArgs, hre, runSuper);
	});
