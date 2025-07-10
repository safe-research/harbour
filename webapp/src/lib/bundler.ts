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

const getUserOpGasPrice = async (
	bundlerProvider: JsonRpcProvider,
): Promise<GasFee> => {
    // TODO: refactor to use pimlico agnostic gas price fetching
	const fees: { standard: GasFee } = await bundlerProvider.send(
		"pimlico_getUserOperationGasPrice",
		[],
	);
	return fees.standard;
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
	const gasFee = await getUserOpGasPrice(bundlerProvider);
	console.log({ gasFee });
	const limits = await getUserOpGasLimits(bundlerProvider, entryPoint, userOp);
	userOp.maxFeePerGas = gasFee.maxFeePerGas;
	userOp.maxPriorityFeePerGas = gasFee.maxPriorityFeePerGas;
	userOp.preVerificationGas = limits.preVerificationGas;
	userOp.verificationGasLimit = limits.verificationGasLimit;
	userOp.callGasLimit = limits.callGasLimit;
	return { userOp, entryPoint };
}
