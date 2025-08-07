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
	.addParam("paymaster", "Override paymaster contract address to use", undefined, types.string, true)
	.setAction(async (taskArgs, hre, runSuper) => {
		// We have to use a dynamic import, as typechain is not immediately available in tasks
		const { submitSignature } = await import("./actions/harbour");
		await submitSignature(taskArgs, hre, runSuper);
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
	.addParam("paymaster", "Override paymaster contract address to use", undefined, types.string, true)
	.addParam("validatorUrl", "Url of external validator", undefined, types.string, true)
	.setAction(async (taskArgs, hre, runSuper) => {
		const { relayWithValidator } = await import("./actions/harbour");
		await relayWithValidator(taskArgs, hre, runSuper);
	});
