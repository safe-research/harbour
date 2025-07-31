import {
	type Address,
	type Client,
	createPublicClient,
	http,
	type LocalAccount,
} from "viem";
import { createBundlerClient } from "viem/account-abstraction";
import { encodePaymasterData } from "../erc4337/paymaster";
import { buildUserOp, sendUserOp, signUserOp } from "../erc4337/userOp";
import { getGasFee } from "../ethereum/fees";
import type { SignedSafeTransaction } from "../safe/types";

export class SafeTransactionHandler {
	private publicClient: Client;
	private bundlerClient: Client;
	constructor(
		private account: LocalAccount,
		private chainId: bigint,
		private harbour: Address,
		private entryPoint: Address,
		private paymaster: Address,
		harbourRpc: string,
		bundlerRpc: string,
	) {
		this.publicClient = createPublicClient({
			transport: http(harbourRpc),
		});
		this.bundlerClient = createBundlerClient({
			transport: http(bundlerRpc),
		});
	}

	async handle(safeTx: SignedSafeTransaction) {
		console.log({ safeTx });
		const gasFee = await getGasFee(this.publicClient);
		// Set timeframe in which the validation is valid
		const now = Math.floor(Date.now() / 1000);
		const validAfter = now - 6 * 60;
		// 2 hours valid
		const validUntil = now + 2 * 3600;
		const paymasterData = encodePaymasterData({ validAfter, validUntil });
		const userOp = await buildUserOp(
			this.publicClient,
			this.bundlerClient,
			this.harbour,
			safeTx,
			this.entryPoint,
			this.paymaster,
			paymasterData,
			gasFee,
		);
		const packedUserOp = await signUserOp(
			this.account,
			this.chainId,
			this.entryPoint,
			userOp,
		);
		userOp.signature = packedUserOp.signature;
		console.log(await sendUserOp(this.bundlerClient, this.entryPoint, userOp));
	}
}
