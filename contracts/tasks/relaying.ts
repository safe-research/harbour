import { task, types } from "hardhat/config";

// Example: npm exec -- hardhat submit-signature --network sepolia --safe 0x... --chain-id 100 --tx '{"to":"0x..."}'
task("submit-signature", "Submits a signature to harbour")
	.addParam("safe", "Safe for which a transaction should be proposed", undefined, types.string)
	.addParam("tx", "Transaction that should be proposed", undefined, types.json)
	.addFlag("asPaymaster", "Submit the signature using the trusted paymaster")
	.addParam(
		"chainId",
		"ChainId of the chain for which the Transaction should be proposed (defaults to current active chain)",
		undefined,
		types.bigint,
		true,
	)
	.addParam("harbour", "Override harbour contract address to use", undefined, types.string, true)
	.setAction(async (taskArgs, hre, runSuper) => {
		// We have to use a dynamic import, as typechain is not immediately available in tasks
		const { submitSignature } = await import("./actions/submitSignature");
		await submitSignature(taskArgs, hre, runSuper);
	});

// Example: npm exec hardhat fund-paymaster -- --network sepolia --amount 0.01
task("fund-paymaster", "Fund the paymaster on the 4337 entrypoint")
	.addParam("amount", "Amount the paymaster should be funded with", undefined, types.string)
	.addParam("harbour", "Override harbour contract address to use", undefined, types.string, true)
	.setAction(async (taskArgs, hre, runSuper) => {
		// We have to use a dynamic import, as typechain is not immediately available in tasks
		const { fundPaymaster } = await import("./actions/submitSignature");
		await fundPaymaster(taskArgs, hre, runSuper);
	});

// Example: npm exec hardhat deposit-validator-tokens -- --network sepolia --amount 0.01
task("deposit-validator-tokens", "Deposits token to the paymaster for a validator")
	.addParam("amount", "Amount of tokens to deposit for the validator", undefined, types.string)
	.addParam("validator", "Address of validator to deposit the tokens for (default: address of signer)", undefined, types.string, true)
	.addParam("harbour", "Override harbour contract address to use", undefined, types.string, true)
	.setAction(async (taskArgs, hre, runSuper) => {
		// We have to use a dynamic import, as typechain is not immediately available in tasks
		const { depositValidatorTokens } = await import("./actions/submitSignature");
		await depositValidatorTokens(taskArgs, hre, runSuper);
	});

// Example: npm exec hardhat relay-signature -- --network sepolia --safe 0x... --chain-id 100 --tx '{"to":"0x..."}'
task("relay-signature", "Relays a signature to harbour with a validator")
	.addParam("safe", "Safe for which a transaction should be proposed", undefined, types.string)
	.addParam("tx", "Transaction that should be proposed", undefined, types.json)
	.addParam(
		"chainId",
		"ChainId of the chain for which the Transaction should be proposed (defaults to current active chain)",
		undefined,
		types.bigint,
		true,
	)
	.addParam("harbour", "Override harbour contract address to use", undefined, types.string, true)
	.addParam("validatorUrl", "Url of external validator", undefined, types.string, true)
	.setAction(async (taskArgs, hre, runSuper) => {
		const { relayWithValidator } = await import("./actions/validator");
		await relayWithValidator(taskArgs, hre, runSuper);
	});
