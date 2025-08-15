import {
	type AddressLike,
	type BigNumberish,
	type BytesLike,
	ethers,
	getAddress,
	hexlify,
	isHexString,
	recoverAddress,
	resolveAddress,
	Signature,
	type Signer,
	toBeHex,
	toBigInt,
	ZeroAddress,
	ZeroHash,
} from "ethers";
import { type EntryPoint, IAccountExecute__factory, type SafeInternationalHarbour } from "../../typechain-types";
import type { PackedUserOperationStruct } from "../../typechain-types/@account-abstraction/contracts/interfaces/IAggregator";
import type { ERC4337MixinConfigStruct } from "../../typechain-types/src/SafeInternationalHarbour";
import { EIP712_SAFE_TX_TYPE, getSafeTransactionHash, type SafeTransaction } from "./safeTx";

const EIP712_PACKED_USEROP_TYPE = {
	// "PackedUserOperation(address sender,uint256 nonce,bytes initCode,bytes callData,bytes32 accountGasLimits,uint256 preVerificationGas,bytes32 gasFees,bytes paymasterAndData)"
	PackedUserOperation: [
		{ type: "address", name: "sender" },
		{ type: "uint256", name: "nonce" },
		{ type: "bytes", name: "initCode" },
		{ type: "bytes", name: "callData" },
		{ type: "bytes32", name: "accountGasLimits" },
		{ type: "uint256", name: "preVerificationGas" },
		{ type: "bytes32", name: "gasFees" },
		{ type: "bytes", name: "paymasterAndData" },
	],
};

export function build4337Config(params?: Partial<ERC4337MixinConfigStruct>): ERC4337MixinConfigStruct {
	return {
		entryPoint: params?.entryPoint || ZeroAddress,
	};
}

export function encodeCallData(
	safe: string,
	chainId: bigint,
	tx: SafeTransaction,
	signatureBytes: string,
): PackedUserOperationStruct {
	const safeTxHash = getSafeTransactionHash(safe, chainId, tx);
	const signature = Signature.from(signatureBytes);
	const signer = recoverAddress(safeTxHash, signature);
	const encodedData = ethers.AbiCoder.defaultAbiCoder().encode(
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
		],
	);
	const executeUserOpSelector = IAccountExecute__factory.createInterface().getFunction("executeUserOp").selector;
	return ethers.concat([executeUserOpSelector, encodedData]);
}

export function buildUserOp(
	harbour: AddressLike,
	safe: string,
	chainId: bigint,
	tx: SafeTransaction,
	signatureBytes: string,
	entryPointNonce: BigNumberish,
	paymasterAndData?: BytesLike,
	gasFees?: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint },
): PackedUserOperationStruct {
	const callData = encodeCallData(safe, chainId, tx, signatureBytes);
	return {
		sender: harbour,
		nonce: entryPointNonce,
		initCode: "0x",
		callData,
		accountGasLimits: toBeHex((callData.length / 2) * 180, 16) + toBeHex((callData.length / 2) * 800, 16).slice(2),
		preVerificationGas: 0,
		gasFees: gasFees
			? toBeHex(gasFees.maxPriorityFeePerGas, 16) + toBeHex(gasFees.maxFeePerGas, 16).slice(2)
			: ZeroHash,
		paymasterAndData: paymasterAndData || "0x",
		signature: "0x",
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
	signerWallet: Pick<Signer, "getAddress" | "signTypedData">,
	chainId: bigint,
	safeAddress: string,
	safeTx: SafeTransaction,
	paymasterAndData?: BytesLike,
	gasFees?: { maxFeePerGas: bigint; maxPriorityFeePerGas: bigint },
): Promise<{ userOp: PackedUserOperationStruct; signature: string }> {
	const signature = await signerWallet.signTypedData(
		{ chainId, verifyingContract: safeAddress },
		EIP712_SAFE_TX_TYPE,
		safeTx,
	);
	const userOpNonce = await harbour.getNonce(await signerWallet.getAddress());
	return {
		userOp: buildUserOp(harbour, safeAddress, chainId, safeTx, signature, userOpNonce, paymasterAndData, gasFees),
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
	paymaster: string | undefined;
	paymasterVerificationGasLimit: string | undefined;
	paymasterPostOpGasLimit: string | undefined;
	paymasterData: string | undefined;

	signature: string;
};

export async function serialize(userOp: PackedUserOperationStruct): Promise<UserOpRequest> {
	if (hexlify(userOp.initCode) !== "0x") throw Error("Unsupported initCode");
	const gasLimits = ethers.zeroPadValue(userOp.accountGasLimits, 32).slice(2);
	const gasFees = ethers.zeroPadValue(userOp.gasFees, 32).slice(2);
	return {
		...decodePaymasterAndData(userOp.paymasterAndData || "0x"),
		sender: await ethers.resolveAddress(userOp.sender),
		nonce: ethers.toBeHex(userOp.nonce),
		callData: hexlify(userOp.callData),
		callGasLimit: `0x${gasLimits.slice(32)}`,
		verificationGasLimit: `0x${gasLimits.slice(0, 32)}`,
		preVerificationGas: ethers.toBeHex(userOp.preVerificationGas),
		maxFeePerGas: `0x${gasFees.slice(32)}`,
		maxPriorityFeePerGas: `0x${gasFees.slice(0, 32)}`,
		signature: hexlify(userOp.signature),
	};
}

export function calculateMaxGasUsageForUserOp(userOp: PackedUserOperationStruct): bigint {
	const gasLimits = ethers.zeroPadValue(userOp.accountGasLimits, 32).slice(2);
	const preVerificationGas = ethers.toBigInt(userOp.preVerificationGas);
	const verificationGasLimit = BigInt(`0x${gasLimits.slice(0, 32)}`);
	const callGasLimit = BigInt(`0x${gasLimits.slice(32)}`);
	const paymasterVerificationGasLimit = BigInt(`0x${userOp.paymasterAndData.slice(42, 74)}`);
	const paymasterPostOpGasLimit = BigInt(`0x${userOp.paymasterAndData.slice(74, 106)}`);
	return (
		preVerificationGas + verificationGasLimit + callGasLimit + paymasterVerificationGasLimit + paymasterPostOpGasLimit
	);
}

function decodePaymasterAndData(paymasterAndData: BytesLike): {
	paymaster: string | undefined;
	paymasterVerificationGasLimit: string | undefined;
	paymasterPostOpGasLimit: string | undefined;
	paymasterData: string | undefined;
} {
	const data = hexlify(paymasterAndData);
	if (!isHexString(data) || data.length !== 130) {
		return {
			paymaster: undefined,
			paymasterVerificationGasLimit: undefined,
			paymasterPostOpGasLimit: undefined,
			paymasterData: undefined,
		};
	}
	return {
		paymaster: getAddress(data.slice(0, 42)),
		paymasterVerificationGasLimit: toBeHex(toBigInt(`0x${data.slice(42, 74)}`)),
		paymasterPostOpGasLimit: toBeHex(toBigInt(`0x${data.slice(74, 106)}`)),
		paymasterData: `0x${data.slice(106, 130)}`,
	};
}

export async function encodePaymasterData(params: {
	paymaster: AddressLike;
	paymasterVerificationGas?: bigint;
	validAfter?: bigint;
	validUntil?: bigint;
}): Promise<string> {
	return ethers.solidityPacked(
		["address", "uint128", "uint128", "uint48", "uint48"],
		[
			await resolveAddress(params.paymaster),
			params.paymasterVerificationGas || 500_000n,
			0,
			params.validAfter || 0,
			params.validUntil || 0,
		],
	);
}

export async function signUserOp(
	chainId: bigint,
	entryPoint: EntryPoint,
	userOp: PackedUserOperationStruct,
	signer: Pick<Signer, "signTypedData">,
): Promise<string> {
	return signer.signTypedData(
		{
			name: "ERC4337",
			version: "1",
			chainId,
			verifyingContract: await entryPoint.getAddress(),
		},
		EIP712_PACKED_USEROP_TYPE,
		{
			...userOp,
			sender: await ethers.resolveAddress(userOp.sender),
		},
	);
}

export async function getUserOpHash(
	chainId: bigint,
	entryPoint: EntryPoint,
	userOp: PackedUserOperationStruct,
): Promise<string> {
	return ethers.TypedDataEncoder.hash(
		{
			name: "ERC4337",
			version: "1",
			chainId,
			verifyingContract: await entryPoint.getAddress(),
		},
		EIP712_PACKED_USEROP_TYPE,
		{
			...userOp,
			sender: await ethers.resolveAddress(userOp.sender),
		},
	);
}
