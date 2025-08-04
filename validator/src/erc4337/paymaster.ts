import { encodePacked, type Hex } from "viem";

export function encodePaymasterData(params?: {
	validAfter?: number;
	validUntil?: number;
}): Hex {
	return encodePacked(
		["uint48", "uint48"],
		[params?.validAfter ?? 0, params?.validUntil ?? 0],
	);
}
