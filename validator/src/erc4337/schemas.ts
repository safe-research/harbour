import z from "zod";
import {
	bigintStringSchema,
	checkedAddressSchema,
	hexDataSchema,
} from "../utils/schemas.js";

export const gasLimitsSchema = z.object({
	preVerificationGas: bigintStringSchema,
	callGasLimit: bigintStringSchema,
	verificationGasLimit: bigintStringSchema,
	paymasterVerificationGasLimit: bigintStringSchema,
	paymasterPostOpGasLimit: bigintStringSchema,
});

export const userOpSchema = gasLimitsSchema.extend({
	sender: checkedAddressSchema,
	nonce: bigintStringSchema,
	callData: hexDataSchema,
	maxFeePerGas: bigintStringSchema,
	maxPriorityFeePerGas: bigintStringSchema,
	paymaster: checkedAddressSchema,
	paymasterData: hexDataSchema,
	signature: hexDataSchema,
});
