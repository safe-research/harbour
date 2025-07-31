import {
	type Address,
	type Client,
	encodeFunctionData,
	encodePacked,
	type Hex,
	hashTypedData,
	hexToBigInt,
	type LocalAccount,
	recoverAddress,
	signatureToCompactSignature,
	toHex,
} from "viem";
import type { GasFee } from "../ethereum/types";
import { HARBOUR_ABI } from "../harbour/constants";
import { getHarbour } from "../harbour/contracts";
import { getSafeTransactionHash } from "../safe/transactions";
import type { SignedSafeTransaction } from "../safe/types";
import { entrypoint712Types } from "./constants";
import type { GasLimits, PackedUserOp, RpcUserOp, UserOp } from "./types";

const DUMMY_SIGNATURE =
	"0x6e100a352ec6ad1b70802290e18aeed190704973570f3b8ed42cb9808e2ea6bf4a90a229a244495b41890987806fcbd2d5d23fc0dbe5f5256c2613c039d76db81c";

const getUserOpGasLimits = async (
	bundlerClient: Client,
	entryPoint: Address,
	userOp: UserOp,
): Promise<GasLimits> => {
	const limits = await bundlerClient.request({
		method: "eth_estimateUserOperationGas",
		params: [toRpcUserOp(userOp), entryPoint],
	});
	if (!limits?.paymasterVerificationGasLimit)
		throw Error("Could not estimate paymaster verification gas limit");
	return {
		preVerificationGas: hexToBigInt(limits.preVerificationGas),
		verificationGasLimit: hexToBigInt(limits.verificationGasLimit),
		callGasLimit: hexToBigInt(limits.callGasLimit),
		paymasterVerificationGasLimit: hexToBigInt(
			limits.paymasterVerificationGasLimit,
		),
		paymasterPostOpGasLimit: limits?.paymasterPostOpGasLimit
			? hexToBigInt(limits?.paymasterPostOpGasLimit)
			: 0n,
	};
};

export async function buildUserOp(
	harbourClient: Client,
	bundlerCient: Client,
	harbour: Address,
	transaction: SignedSafeTransaction,
	entryPoint: Address,
	paymaster: Address,
	paymasterData: Hex,
	gasFee: GasFee,
): Promise<UserOp> {
	const harbourContract = getHarbour(harbourClient, harbour);
	const safeTxHash = getSafeTransactionHash(transaction);
	const signer = await recoverAddress({
		hash: safeTxHash,
		signature: transaction.signature,
	});
	const userSignature = signatureToCompactSignature(transaction.signature);
	const userOpNonce = await harbourContract.read.getNonce([signer]);
	const callData = encodeFunctionData({
		abi: HARBOUR_ABI,
		functionName: "storeTransaction",
		args: [
			safeTxHash,
			transaction.safe,
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
			signer,
			userSignature.r,
			userSignature.yParityAndS,
		],
	});
	const userOp: UserOp = {
		sender: harbourContract.address,
		nonce: userOpNonce,
		callData,
		callGasLimit: BigInt((callData.length / 2) * 180),
		verificationGasLimit: BigInt((callData.length / 2) * 800),
		preVerificationGas: 0n,
		maxFeePerGas: 0n,
		maxPriorityFeePerGas: 0n,
		paymaster: paymaster,
		paymasterData,
		// Set dummy values for estimation
		paymasterVerificationGasLimit: 500_000n,
		paymasterPostOpGasLimit: 0n,
		signature: DUMMY_SIGNATURE,
	};
	const limits = await getUserOpGasLimits(bundlerCient, entryPoint, userOp);
	userOp.maxFeePerGas = gasFee.maxFeePerGas;
	userOp.maxPriorityFeePerGas = gasFee.maxPriorityFeePerGas;
	userOp.preVerificationGas = limits.preVerificationGas;
	userOp.verificationGasLimit = limits.verificationGasLimit;
	userOp.callGasLimit = limits.callGasLimit;
	userOp.paymasterVerificationGasLimit = limits.paymasterVerificationGasLimit;
	userOp.paymasterPostOpGasLimit = limits.paymasterPostOpGasLimit;
	// Reset signature, as this was only set for estimation
	userOp.signature = "0x";
	return userOp;
}

export async function sendUserOp(
	client: Client,
	entryPoint: Address,
	userOp: UserOp,
) {
	return await client.request({
		method: "eth_sendUserOperation",
		params: [toRpcUserOp(userOp), entryPoint],
	});
}

export function toRpcUserOp(userOp: UserOp): RpcUserOp {
	return {
		...userOp,
		callGasLimit: toHex(userOp.callGasLimit),
		verificationGasLimit: toHex(userOp.verificationGasLimit),
		maxFeePerGas: toHex(userOp.maxFeePerGas),
		maxPriorityFeePerGas: toHex(userOp.maxPriorityFeePerGas),
		nonce: toHex(userOp.nonce),
		paymasterPostOpGasLimit: toHex(userOp.paymasterPostOpGasLimit),
		paymasterVerificationGasLimit: toHex(userOp.paymasterVerificationGasLimit),
		preVerificationGas: toHex(userOp.preVerificationGas),
	};
}

export function packUserOp(userOp: UserOp): PackedUserOp {
	return {
		sender: userOp.sender,
		nonce: userOp.nonce,
		initCode: "0x",
		callData: userOp.callData,
		accountGasLimits: encodePacked(
			["uint128", "uint128"],
			[userOp.verificationGasLimit, userOp.callGasLimit],
		),
		preVerificationGas: userOp.preVerificationGas,
		gasFees: encodePacked(
			["uint128", "uint128"],
			[userOp.maxPriorityFeePerGas, userOp.maxFeePerGas],
		),
		paymasterAndData: encodePacked(
			["address", "uint128", "uint128", "bytes"],
			[
				userOp.paymaster,
				userOp.paymasterVerificationGasLimit,
				userOp.paymasterPostOpGasLimit,
				userOp.paymasterData,
			],
		),
		signature: userOp.signature,
	};
}

export async function getUserOpHash(
	chainId: bigint,
	entrypoint: Address,
	userOp: UserOp,
): Promise<Hex> {
	const packedUserOp = packUserOp(userOp);
	return hashTypedData({
		domain: {
			name: "ERC4337",
			version: "1",
			chainId: chainId,
			verifyingContract: entrypoint,
		},
		types: entrypoint712Types,
		primaryType: "PackedUserOperation",
		message: packedUserOp,
	});
}

export async function signUserOp(
	account: LocalAccount,
	chainId: bigint,
	entrypoint: Address,
	userOp: UserOp,
): Promise<PackedUserOp> {
	const packedUserOp = packUserOp(userOp);
	packedUserOp.signature = await account.signTypedData({
		domain: {
			name: "ERC4337",
			version: "1",
			chainId: chainId,
			verifyingContract: entrypoint,
		},
		types: entrypoint712Types,
		primaryType: "PackedUserOperation",
		message: packedUserOp,
	});
	return packedUserOp;
}
