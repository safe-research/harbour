import {
	type AddressLike,
	type BigNumberish,
	ethers,
	hexlify,
	recoverAddress,
	Signature,
	type Signer,
	toBeHex,
	ZeroAddress,
	ZeroHash,
} from "ethers";
import { ERC4337Mixin__factory, type SafeInternationalHarbour } from "../../typechain-types";
import type { PackedUserOperationStruct } from "../../typechain-types/@account-abstraction/contracts/interfaces/IAggregator";
import { EIP712_SAFE_TX_TYPE, getSafeTransactionHash, type SafeTransaction } from "./safeTx";

export function buildUserOp(
	harbour: AddressLike,
	safe: string,
	chainId: bigint,
	tx: SafeTransaction,
	signatureBytes: string,
	entryPointNonce: BigNumberish,
): PackedUserOperationStruct {
	const safeTxHash = getSafeTransactionHash(safe, chainId, tx);
	const signature = Signature.from(signatureBytes);
	const signer = recoverAddress(safeTxHash, signature);
	const callData = ERC4337Mixin__factory.createInterface().encodeFunctionData("storeTransaction", [
		safeTxHash,
		safe,
		chainId,
		tx.nonce,
		tx.to,
		tx.value,
		tx.data,
		tx.operation,
		tx.safeTxGas,
		tx.baseGas,
		tx.gasPrice,
		tx.gasToken,
		tx.refundReceiver,
		signer,
		signature.r,
		signature.yParityAndS,
	]);
	return {
		sender: harbour,
		nonce: entryPointNonce,
		initCode: "0x",
		callData,
		accountGasLimits: toBeHex(2_000_000, 16) + toBeHex(2_000_000, 16).slice(2),
		preVerificationGas: 0,
		gasFees: ZeroHash,
		paymasterAndData: "0x",
		signature: signature.serialized,
	};
}

export function buildSafeTx(params: Partial<SafeTransaction> = {}): SafeTransaction {
	return {
		nonce: params.nonce || 0n,
		to: params.to || ZeroAddress,
		value: params.value || 0n,
		data: params.data || "0x",
		operation: params.operation || 0,
		safeTxGas: params.safeTxGas || 0n,
		baseGas: params.baseGas || 0n,
		gasPrice: params.gasPrice || 0n,
		gasToken: params.gasToken || ZeroAddress,
		refundReceiver: params.refundReceiver || ZeroAddress,
	};
}

export async function buildSignedUserOp(
	harbour: SafeInternationalHarbour,
	signerWallet: Signer,
	chainId: bigint,
	safeAddress: string,
	safeTx: SafeTransaction,
): Promise<{ userOp: PackedUserOperationStruct; signature: string }> {
	const signature = await signerWallet.signTypedData(
		{ chainId, verifyingContract: safeAddress },
		EIP712_SAFE_TX_TYPE,
		safeTx,
	);
	const userOpNonce = await harbour.getNonce(await signerWallet.getAddress());
	return {
		userOp: buildUserOp(harbour, safeAddress, chainId, safeTx, signature, userOpNonce),
		signature,
	};
}

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

export async function serialize(userOp: PackedUserOperationStruct): Promise<UserOpRequest> {
	if (hexlify(userOp.initCode) !== "0x") throw Error("Unsupported initCode");
	if (hexlify(userOp.paymasterAndData) !== "0x") throw Error("Unsupported paymasterAndData");
	const gasLimits = ethers.zeroPadValue(userOp.accountGasLimits, 32).slice(2);
	const gasFees = ethers.zeroPadValue(userOp.gasFees, 32).slice(2);
	return {
		sender: await ethers.resolveAddress(userOp.sender),
		nonce: ethers.toBeHex(userOp.nonce),
		callData: hexlify(userOp.callData),
		callGasLimit: `0x${gasLimits.slice(0, 32)}`,
		verificationGasLimit: `0x${gasLimits.slice(32)}`,
		preVerificationGas: ethers.toBeHex(userOp.preVerificationGas),
		maxFeePerGas: `0x${gasFees.slice(0, 32)}`,
		maxPriorityFeePerGas: `0x${gasFees.slice(32)}`,
		signature: hexlify(userOp.signature),
	};
}
