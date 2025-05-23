import type { Provider } from "ethers";
import { ethers } from "ethers";

/** The deployed address of the Multicall3 contract. Same on all chains. */
const MULTICALL_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

/** ABI for the Multicall3 contract, specifically the aggregate3 function. */
const MULTICALL_ABI = [
	"function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)",
] as const;

/**
 * Executes a batch of view calls using the Multicall3 contract.
 *
 * @param provider - The Ethers.js JSON RPC API provider.
 * @param calls - An array of call objects to be executed.
 * @returns A promise that resolves to an array of result objects, each containing `success` and `returnData`.
 */
function aggregateMulticall(
	provider: Provider,
	calls: Array<{ target: string; allowFailure?: boolean; callData: string }>,
): Promise<{ success: boolean; returnData: string }[]> {
	const contract = new ethers.Contract(MULTICALL_ADDRESS, MULTICALL_ABI, provider);

	for (const call of calls) {
		if (call.allowFailure === undefined) {
			call.allowFailure = false;
		}
	}

	return contract.aggregate3.staticCall(calls);
}

export { MULTICALL_ADDRESS, MULTICALL_ABI, aggregateMulticall };
