import { type Client, hexToBigInt } from "viem";
import type { GasFee } from "./types.js";

export const getGasFee = async (
	harbourClient: Client,
	basePriceMultiplier?: bigint,
	priorityFeeMultiplier?: bigint,
): Promise<GasFee> => {
	const feeHistory = await harbourClient.request({
		method: "eth_feeHistory",
		params: ["0x1", "latest", [100]],
	});
	const maxPriorityFeePerGas =
		hexToBigInt(
			await harbourClient.request({
				method: "eth_maxPriorityFeePerGas",
			}),
		) * (priorityFeeMultiplier ?? 2n);
	const baseFee =
		BigInt(feeHistory.baseFeePerGas[0]) * (basePriceMultiplier ?? 2n);
	return {
		maxFeePerGas: baseFee + maxPriorityFeePerGas,
		maxPriorityFeePerGas: maxPriorityFeePerGas,
	};
};
