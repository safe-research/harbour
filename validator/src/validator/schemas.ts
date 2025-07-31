import type { Address } from "viem";
import z from "zod";
import { userOpSchema } from "../erc4337/schemas";
import {
	safeIdSchema,
	safeSignatureSchema,
	safeTransactionSchema,
} from "../safe/schemas";
import { hexDataSchema } from "../utils/schemas";

export const validateSafeTransactionRequestSchema = z.object({
	...safeTransactionSchema.shape,
	...safeIdSchema.shape,
	...safeSignatureSchema.shape,
});

export const buildValidateUserOpSchema = (
	supportedPaymaster: Address,
	supportedHarbour: Address,
) =>
	z.object({
		...userOpSchema.shape,
		sender: z.literal(supportedHarbour),
		paymaster: z.literal(supportedPaymaster),
		paymasterData: hexDataSchema.refine((val) => val.length === 26),
		signature: z.literal("0x"),
	});
