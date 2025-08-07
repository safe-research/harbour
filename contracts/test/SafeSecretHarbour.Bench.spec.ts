import { ethers } from "hardhat";
import { describeBench } from "./utils/bench";
import { encryptSafeTransaction, randomX25519KeyPair } from "./utils/encryption";
import { getSafeTransactionStructHash, signSafeTransaction } from "./utils/safeTx";

describeBench(
	"SafeSecretHarbour",
	async () => {
		const Factory = await ethers.getContractFactory("SafeSecretHarbour");
		const harbour = await Factory.deploy();

		const recipients = await Promise.all(
			[...Array(3)].map(async () => {
				const { encryptionKey } = await randomX25519KeyPair();
				return encryptionKey;
			}),
		);

		return { harbour, recipients };
	},
	async ({ signer, harbour, chainId, safe, safeTx, existing, recipients }) => {
		const safeTxStructHash = getSafeTransactionStructHash(safeTx);
		const signature = await signSafeTransaction(signer, safe, chainId, safeTx);
		const encryptedSafeTx = existing ? "0x" : await encryptSafeTransaction(safeTx, recipients);
		return await harbour.registerTransaction(chainId, safe, safeTx.nonce, safeTxStructHash, signature, encryptedSafeTx);
	},
);
