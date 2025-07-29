import type { Address, Hex } from "viem";
import type z from "zod";
import type { userOpSchema } from "./schemas";

export type UserOp = z.infer<typeof userOpSchema>;

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
