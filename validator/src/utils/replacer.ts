import { toHex } from "viem";

export function bigIntJsonReplacer(_key: string, value: unknown): unknown {
	if (typeof value === "bigint") {
		return toHex(value);
	}
	return value;
}
