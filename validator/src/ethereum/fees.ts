import { type Client, hexToBigInt } from "viem";
import type { GasFee } from "./types.js";

export const getGasFee = async (
	harbourClient: Client,
	basePriceMultiplier?: bigint,
): Promise<GasFee> => {
	const feeHistory = await harbourClient.request({
		method: "eth_feeHistory",
		params: ["0x1", "latest", [100]],
	});
	const maxPriorityFeePerGas = await harbourClient.request({
		method: "eth_maxPriorityFeePerGas",
	});
	const baseFee =
		BigInt(feeHistory.baseFeePerGas[0]) * (basePriceMultiplier ?? 2n);
	return {
		maxFeePerGas: baseFee + BigInt(maxPriorityFeePerGas),
		maxPriorityFeePerGas: hexToBigInt(maxPriorityFeePerGas),
	};
};
