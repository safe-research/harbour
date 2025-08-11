import type { BaseContract } from "ethers";

export function error(contract: BaseContract, name: string, values: unknown[] = []): string {
	return contract.interface.encodeErrorResult(name, values);
}
