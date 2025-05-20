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

export const chainIdSchema = z.number().int().positive();
