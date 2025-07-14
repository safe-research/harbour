import {
	type Contract,
	type JsonRpcProvider,
	type JsonRpcSigner,
	Signature,
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
	// paymaster: string | undefined;
	// paymasterVerificationGasLimit: string | undefined;
	// paymasterPostOpGasLimit: string | undefined;
	// paymasterData: string | undefined;

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
): Promise<GasFee> => {
	const feeHistory = await provider.send("eth_feeHistory", ["0x1", "latest"]);
	const maxPriorityFeePerGas = await provider.send(
		"eth_maxPriorityFeePerGas",
		[],
	);
	return {
		maxFeePerGas: feeHistory.baseFeePerGas[0],
		maxPriorityFeePerGas,
	};
};

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
	limitsOverwrite?: GasLimits,
): Promise<{ userOp: UserOpRequest; entryPoint: string }> {
	const signerAddress = await signer.getAddress();
	const safeTxHash = getSafeTransactionHash(transaction);
	const packedSig = Signature.from(signature);
	const entryPoint = await harbour.SUPPORTED_ENTRYPOINT();
	const userOpNonce = await harbour.getNonce(signerAddress);
	const callData = harbour.interface.encodeFunctionData("storeTransaction", [
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
		packedSig.r,
		packedSig.yParityAndS,
	]);
	const userOp = {
		sender: await harbour.getAddress(),
		nonce: toBeHex(userOpNonce),
		callData,
		callGasLimit: toBeHex((callData.length / 2) * 180),
		verificationGasLimit: toBeHex((callData.length / 2) * 800),
		preVerificationGas: toBeHex(0),
		maxFeePerGas: toBeHex(0),
		maxPriorityFeePerGas: toBeHex(0),
		signature: packedSig.serialized,
	};
	const limits =
		limitsOverwrite ||
		(await getUserOpGasLimits(bundlerProvider, entryPoint, userOp));
	userOp.maxFeePerGas = gasFee.maxFeePerGas;
	userOp.maxPriorityFeePerGas = gasFee.maxPriorityFeePerGas;
	userOp.preVerificationGas = limits.preVerificationGas;
	userOp.verificationGasLimit = limits.verificationGasLimit;
	userOp.callGasLimit = limits.callGasLimit;
	return { userOp, entryPoint };
}
