import z from "zod";
import {
	bigintStringSchema,
	checkedAddressSchema,
	ecdsaSignatureSchema,
	hexDataSchema,
} from "../utils/schemas.js";

export const safeTransactionSchema = z.object({
	to: checkedAddressSchema,
	value: bigintStringSchema,
	data: hexDataSchema,
	operation: z.union([z.literal(0), z.literal(1)]),
	safeTxGas: bigintStringSchema,
	baseGas: bigintStringSchema,
	gasPrice: bigintStringSchema,
	gasToken: checkedAddressSchema,
	refundReceiver: checkedAddressSchema,
	nonce: bigintStringSchema,
});

export const safeIdSchema = z.object({
	chainId: bigintStringSchema,
	safe: checkedAddressSchema,
});

export const safeSignatureSchema = z.object({
	signature: ecdsaSignatureSchema,
});
