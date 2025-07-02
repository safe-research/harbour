import { task, types } from "hardhat/config";

// Example: npm exec -- hardhat submit-signature --network sepolia
task("submit-signature", "Deploys and verifies Harbour contracts")
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
	.setAction(async (taskArgs, hre, runSuper) => {
		// We have to use a dynamic import, as typechain is not immediately available in tasks
		const { action } = await import("./submitSignatureAction");
		await action(taskArgs, hre, runSuper);
	});
