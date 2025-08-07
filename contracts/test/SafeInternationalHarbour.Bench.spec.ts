import { ethers } from "hardhat";
import { describeBench } from "./utils/bench";
import { build4337Config } from "./utils/erc4337";
import { signSafeTransaction } from "./utils/safeTx";

describeBench(
	"SafeSecretHarbour",
	async ([entryPoint]) => {
		const Factory = await ethers.getContractFactory("SafeInternationalHarbour");
		const erc4337config = build4337Config({ entryPoint: entryPoint.address });
		const harbour = await Factory.deploy(erc4337config);

		return { harbour };
	},
	async ({ signer, harbour, chainId, safe, safeTx }) => {
		const signature = await signSafeTransaction(signer, safe, chainId, safeTx);
		return await harbour.enqueueTransaction(
			safe,
			chainId,
			safeTx.nonce,
			safeTx.to,
			safeTx.value,
			safeTx.data,
			safeTx.operation,
			safeTx.safeTxGas,
			safeTx.baseGas,
			safeTx.gasPrice,
			safeTx.gasToken,
			safeTx.refundReceiver,
			signature,
		);
	},
);
