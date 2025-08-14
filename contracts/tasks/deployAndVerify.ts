import { task } from "hardhat/config";

task("deploy-and-verify", "Deploys and verifies Harbour contracts")
	.addOptionalParam("tags", "Tags to deploy")

	.setAction(async (taskArgs, hre) => {
		const chainId = Number.parseInt(await hre.getChainId());
		const etherscanCustomChainsEntry = hre.config.etherscan.customChains?.find((chain) => chain.chainId === chainId);
		const needsCustomEtherscanUrl = !!etherscanCustomChainsEntry;
		console.log({ needsCustomEtherscanUrl, etherscanCustomChainsEntry });
		await hre.run("deploy", { tags: taskArgs.tags });
		await hre.run("etherscan-verify", {
			forceLicense: true,
			license: "LGPL-3.0",
			apiUrl: needsCustomEtherscanUrl ? etherscanCustomChainsEntry?.urls.apiURL : undefined,
		});
		await hre.run("sourcify", { tags: taskArgs.tags });
	});
