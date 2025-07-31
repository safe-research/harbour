import z from "zod";
import { bigintStringSchema, checkedAddressSchema } from "../utils/schemas";

export const configSchema = z.object({
	VALIDATOR_PK_SEED: z.string().nonempty(),
	SUPPORTED_HARBOUR: checkedAddressSchema,
	SUPPORTED_PAYMASTER: checkedAddressSchema,
	SUPPORTED_ENTRYPOINT: checkedAddressSchema,
	SUPPORTED_CHAIN_ID: bigintStringSchema,
});

export const workerConfigSchema = configSchema.extend({
	HARBOUR_RPC: z.url(),
	BUNDLER_RPC: z.url(),
});
