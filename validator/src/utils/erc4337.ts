import {
	type Address,
	encodePacked,
	getAddress,
	type Hex,
	hashTypedData,
	hexToBigInt,
	type LocalAccount,
	zeroAddress,
} from "viem";
import type { PackedUserOp, UserOp } from "./types";

export function decodePaymasterData(paymasterAndData: Hex): {
	paymaster: Address;
	paymasterVerificationGasLimit: bigint;
	paymasterPostOpGasLimit: bigint;
	paymasterData: Hex;
} {
	if (paymasterAndData.length !== 130) {
		return {
			paymaster: zeroAddress,
			paymasterVerificationGasLimit: 0n,
			paymasterPostOpGasLimit: 0n,
			paymasterData: "0x",
		};
	}
	return {
		paymaster: getAddress(paymasterAndData.slice(0, 42)),
		paymasterVerificationGasLimit: hexToBigInt(
			`0x${paymasterAndData.slice(42, 74)}`,
		),
		paymasterPostOpGasLimit: hexToBigInt(
			`0x${paymasterAndData.slice(74, 106)}`,
		),
		paymasterData: `0x${paymasterAndData.slice(106, 130)}`,
	};
}

export function encodePaymasterData(params: {
	validAfter?: number;
	validUntil?: number;
}): Hex {
	return encodePacked(
		["uint48", "uint48"],
		[params.validAfter || 0, params.validUntil || 0],
	);
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
		signature: "0x",
	};
}

const entrypoint712Types = {
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
} as const;

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
