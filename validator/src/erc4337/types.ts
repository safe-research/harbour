import type { Address, Hex } from "viem";
import type z from "zod";
import type { gasLimitsSchema, userOpSchema } from "./schemas.js";

export type UserOp = z.infer<typeof userOpSchema>;

export type GasLimits = z.infer<typeof gasLimitsSchema>;

export type RpcUserOp = {
	sender: Address;
	nonce: Hex;
	callData: Hex;
	callGasLimit: Hex;
	verificationGasLimit: Hex;
	preVerificationGas: Hex;
	maxFeePerGas: Hex;
	maxPriorityFeePerGas: Hex;
	paymaster: Address;
	paymasterVerificationGasLimit: Hex;
	paymasterPostOpGasLimit: Hex;
	paymasterData: Hex;
	signature: Hex;
};

export type PackedUserOp = {
	sender: Address;
	nonce: bigint;
	initCode: Hex;
	callData: Hex;
	accountGasLimits: Hex;
	preVerificationGas: bigint;
	gasFees: Hex;
	paymasterAndData: Hex;
	signature: Hex;
};
