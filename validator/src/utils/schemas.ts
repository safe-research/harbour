import { Address, getAddress, type Hex, isHex, parseSignature } from "viem";
import z from "zod";

const checkedAddressSchema = z.string().transform((arg) => getAddress(arg));

const hexDataSchema = z
	.string()
	.refine(isHex, "Value is not a valid hex string")
	.transform((val) => val as Hex);

const hexNumberSchema = z
	.string()
	.refine(isHex, "Value is not a valid hex string")
	.refine((val) => val.length > 2);

const bigintStringSchema = z.coerce.bigint().min(0n);

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

export const userOpSchema = z.object({
	sender: checkedAddressSchema,
	nonce: bigintStringSchema,
	callData: hexDataSchema,
  callGasLimit: bigintStringSchema,
  verificationGasLimit: bigintStringSchema,
  preVerificationGas: bigintStringSchema,
  maxFeePerGas: bigintStringSchema,
  maxPriorityFeePerGas: bigintStringSchema,
  paymaster: checkedAddressSchema,
	paymasterVerificationGasLimit: bigintStringSchema,
	paymasterPostOpGasLimit: bigintStringSchema,
	paymasterData: hexDataSchema,
  signature: hexDataSchema
});

export const safeIdSchema = z.object({
	chainId: bigintStringSchema,
	safe: checkedAddressSchema,
});

export const ecdsaSignatureSchema = hexDataSchema.transform(parseSignature);

export const safeSignatureSchema = z.object({
	signature: ecdsaSignatureSchema,
});

export const relayRequestSchema = z.object({
	...safeTransactionSchema.shape,
	...safeIdSchema.shape,
	...safeSignatureSchema.shape,
});

export const buildValidateSchema = (supportedPaymaster: Address) => z.object({
	...userOpSchema.shape,
  paymaster: z.literal(supportedPaymaster),
  paymasterData: hexDataSchema.refine((val) => val.length == 26),
  signature: z.literal("0x")
});

