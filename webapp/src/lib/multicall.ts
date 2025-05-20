import type { JsonRpcApiProvider } from "ethers";
import { ethers } from "ethers";

// https://github.com/mds1/multicall3
const MULTICALL_ADDRESS = "0xcA11bde05977b3631167028862bE2a173976CA11";

const MULTICALL_ABI = [
	"function aggregate3(tuple(address target, bool allowFailure, bytes callData)[] calls) payable returns (tuple(bool success, bytes returnData)[] returnData)",
] as const;

function aggregateMulticall(
	provider: JsonRpcApiProvider,
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
