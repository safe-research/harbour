import { keccak256, toBytes } from "viem";
import { privateKeyToAccount } from "viem/accounts";

export const accountFromSeed = (seed: string) =>
	privateKeyToAccount(keccak256(toBytes(seed)));
