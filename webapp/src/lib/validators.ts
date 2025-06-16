import { z } from "zod";

/**
 * Regular expression for Ethereum address validation
 * Matches 0x followed by exactly 40 hexadecimal characters (case-insensitive)
 */
export const ETHEREUM_ADDRESS_REGEX = /^0x[a-fA-F0-9]{40}$/;

/**
 * Zod schema for validating Ethereum addresses
 */
export const ethereumAddressSchema = z.string().regex(ETHEREUM_ADDRESS_REGEX, "Invalid Ethereum address");

/**
 * Zod schema for validating Safe addresses
 * Alias of ethereumAddressSchema for semantic clarity
 */
export const safeAddressSchema = ethereumAddressSchema;

/**
 * Zod schema for validating Chain IDs.
 * Ensures the chain ID is an integer and a positive number.
 */
export const chainIdSchema = z.number().int().positive();

/**
 * Generic schema for validating numeric strings (reusable for any numeric input)
 */
export const numericStringSchema = z.string().regex(/^\d+$/, "Must be a valid number");

/**
 * Zod schema for validating search parameters for routes that require Safe address and chain ID.
 */
export const safeIdSchema = z.object({
	safe: safeAddressSchema,
	chainId: chainIdSchema,
});

export type SafeId = z.infer<typeof safeIdSchema>;

/**
 * Zod schema for validating nonce values.
 * Accepts either an empty string (to use current safe nonce) or a valid non-negative integer string
 * that is greater than or equal to the current safe nonce.
 * @param currentSafeNonce - current safe nonce as a string
 * @returns Zod schema for nonce validation
 */
export function nonceSchema(currentSafeNonce: string) {
	return z.string().refine(
		(nonce) => {
			if (nonce === "") {
				return true;
			}
			try {
				const n = BigInt(nonce);
				const current = BigInt(currentSafeNonce);
				return n >= BigInt(0) && n >= current;
			} catch {
				return false;
			}
		},
		{
			message: `Invalid nonce: must be empty or a non-negative integer >= ${currentSafeNonce}`,
		},
	);
}

/**
 * Schema for validating positive decimal amounts (e.g., "1.5", "0.1")
 */
export const positiveAmountSchema = z
	.string()
	.min(1, "Amount is required")
	.refine(
		(val) => {
			const num = Number(val);
			return !Number.isNaN(num) && num > 0 && Number.isFinite(num);
		},
		{
			message: "Amount must be a positive number",
		},
	);

/**
 * Schema for validating ETH values (allows 0 and positive values)
 */
export const ethValueSchema = z.string().refine(
	(val) => {
		if (val === "" || val === "0") return true;
		const num = Number(val);
		return !Number.isNaN(num) && num >= 0 && Number.isFinite(num);
	},
	{
		message: "Value must be a non-negative number",
	},
);

/**
 * Schema for validating hex data strings
 */
export const hexDataSchema = z.string().refine(
	(val) => {
		if (val === "") return true;
		return /^0x[a-fA-F0-9]*$/.test(val);
	},
	{
		message: "Data must be a valid hex string (e.g., 0x123abc)",
	},
);

/**
 * Regular expression for WalletConnect URI validation
 * Matches wc: followed by session topic and version 2 parameters
 */
export const WALLETCONNECT_URI_REGEX = /^wc:[a-zA-Z0-9]+@2\?/;

/**
 * Schema for validating WalletConnect URIs
 */
export const walletConnectUriSchema = z.string().regex(WALLETCONNECT_URI_REGEX, "Invalid WalletConnect URI");
