import {
	type Address,
	encodePacked,
	getAddress,
	type Hex,
	hexToBigInt,
	zeroAddress,
} from "viem";

export function decodePaymasterAndData(paymasterAndData: Hex): {
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

export function encodePaymasterData(params?: {
	validAfter?: number;
	validUntil?: number;
}): Hex {
	return encodePacked(
		["uint48", "uint48"],
		[params?.validAfter ?? 0, params?.validUntil ?? 0],
	);
}
