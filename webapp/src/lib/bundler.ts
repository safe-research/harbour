import {
	AbiCoder,
	type Contract,
	concat,
	type JsonRpcProvider,
	type JsonRpcSigner,
	Signature,
	solidityPacked,
	toBeHex,
} from "ethers";
import { getSafeTransactionHash } from "./safe";
import type { FullSafeTransaction } from "./types";

export type UserOpRequest = {
	sender: string;
	nonce: string;

	// initCode: BytesLike;
	// factory: string | undefined;
	// factoryData: string | undefined;

	callData: string;

	// accountGasLimits: BytesLike;
	callGasLimit: string;
	verificationGasLimit: string;

	preVerificationGas: string;

	// gasFees: BytesLike;
	maxFeePerGas: string;
	maxPriorityFeePerGas: string;

	// paymasterAndData: BytesLike;
	paymaster?: string | undefined;
	paymasterVerificationGasLimit?: string | undefined;
	paymasterPostOpGasLimit?: string | undefined;
	paymasterData?: string | undefined;

	signature: string;
};

type GasFee = {
	maxFeePerGas: string;
	maxPriorityFeePerGas: string;
};

type GasLimits = {
	preVerificationGas: string;
	verificationGasLimit: string;
	callGasLimit: string;
	paymasterVerificationGasLimit: string;
	paymasterPostOpGasLimit: string;
};

export const getUserOpGasPrice = async (
	provider: JsonRpcProvider,
	basePriceMultiplier?: bigint,
): Promise<GasFee> => {
	const feeHistory = await provider.send("eth_feeHistory", [
		"0x1",
		"latest",
		[100],
	]);
	const maxPriorityFeePerGas = await provider.send(
		"eth_maxPriorityFeePerGas",
		[],
	);
	const baseFee =
		BigInt(feeHistory.baseFeePerGas[0]) * (basePriceMultiplier ?? 2n);
	return {
		maxFeePerGas: toBeHex(baseFee + BigInt(maxPriorityFeePerGas)),
		maxPriorityFeePerGas,
	};
};

async function encodePaymasterData(params?: {
	validAfter?: bigint;
	validUntil?: bigint;
}): Promise<string> {
	return solidityPacked(
		["uint48", "uint48"],
		[params?.validAfter ?? 0, params?.validUntil ?? 0],
	);
}

const getUserOpGasLimits = async (
	bundlerProvider: JsonRpcProvider,
	entryPoint: string,
	userOp: UserOpRequest,
): Promise<GasLimits> => {
	const limits: GasLimits = await bundlerProvider.send(
		"eth_estimateUserOperationGas",
		[userOp, entryPoint],
	);
	return limits;
};

export async function buildUserOp(
	bundlerProvider: JsonRpcProvider,
	harbour: Contract,
	signer: JsonRpcSigner,
	transaction: FullSafeTransaction,
	signature: string,
	gasFee: GasFee,
	usePaymaster?: boolean,
	limitsOverwrite?: GasLimits,
): Promise<{ userOp: UserOpRequest; entryPoint: string }> {
	const signerAddress = await signer.getAddress();
	const safeTxHash = getSafeTransactionHash(transaction);
	const userSignature = Signature.from(signature);
	const userOpNonce = await harbour.getNonce(signerAddress);
	const selector = harbour.interface.getFunction("executeUserOp")?.selector;
	if (!selector) {
		throw new Error("Harbour interface is missing `executeUserOp` selector");
	}
	const callData = concat([
		AbiCoder.defaultAbiCoder().encode(
			[
				"bytes32",
				"address",
				"uint256",
				"uint256",
				"address",
				"uint256",
				"bytes",
				"uint8",
				"uint256",
				"uint256",
				"uint256",
				"address",
				"address",
				"address",
				"bytes32",
				"bytes32",
			],
			[
				safeTxHash,
				transaction.safeAddress,
				transaction.chainId,
				transaction.nonce,
				transaction.to,
				transaction.value,
				transaction.data,
				transaction.operation,
				transaction.safeTxGas,
				transaction.baseGas,
				transaction.gasPrice,
				transaction.gasToken,
				transaction.refundReceiver,
				signerAddress,
				userSignature.r,
				userSignature.yParityAndS,
			],
		),
	]);
	const userOp: UserOpRequest = {
		sender: await harbour.getAddress(),
		nonce: toBeHex(userOpNonce),
		callData,
		callGasLimit: toBeHex((callData.length / 2) * 180),
		verificationGasLimit: toBeHex((callData.length / 2) * 800),
		preVerificationGas: toBeHex(0),
		maxFeePerGas: toBeHex(0),
		maxPriorityFeePerGas: toBeHex(0),
		signature: "0x",
	};
	if (usePaymaster) {
		// TODO: I'm not sure how to get the paymaster address here...
		const paymaster = `0x${"4337".repeat(10)}`;
		userOp.paymaster = paymaster;
		// Set dummy values for estimation
		const paymasterData = await encodePaymasterData();
		userOp.paymasterData = paymasterData;
		userOp.paymasterPostOpGasLimit = toBeHex(500_000n);
		userOp.paymasterPostOpGasLimit = toBeHex(0);
		userOp.signature = userSignature.serialized;
	}
	const entryPoint = await harbour.SUPPORTED_ENTRYPOINT();
	const limits =
		limitsOverwrite ||
		(await getUserOpGasLimits(bundlerProvider, entryPoint, userOp));
	userOp.maxFeePerGas = gasFee.maxFeePerGas;
	userOp.maxPriorityFeePerGas = gasFee.maxPriorityFeePerGas;
	userOp.preVerificationGas = limits.preVerificationGas;
	userOp.verificationGasLimit = limits.verificationGasLimit;
	userOp.callGasLimit = limits.callGasLimit;
	userOp.paymasterVerificationGasLimit = limits.paymasterVerificationGasLimit;
	userOp.paymasterPostOpGasLimit = limits.paymasterPostOpGasLimit;
	// Reset signature, as this was only set for estimation
	userOp.signature = "0x";
	return { userOp, entryPoint };
}
