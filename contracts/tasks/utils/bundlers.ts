import { toBeHex } from "ethers";
import type { EthereumProvider } from "hardhat/types";
import { serialize } from "../../test/utils/erc4337";
import type { PackedUserOperationStruct } from "../../typechain-types/src/SafeHarbourPaymaster";

type JsonRpcResult<R> = {
	jsonrpc: "2.0";
	id: number;
	result: R | undefined;
};

const call = async <T>(method: string, params: unknown[]): Promise<T> => {
	const bundlerUrl = process.env.BUNLDER_URL;
	if (!bundlerUrl) throw Error("Bundler URL required");
	const response = await fetch(bundlerUrl, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			jsonrpc: "2.0",
			method,
			params,
			id: 1,
		}),
	});
	if (!response.ok) throw Error("Request Failed");
	const rpcResult = (await response.json()) as JsonRpcResult<T>;
	if (!rpcResult.result) throw Error(`JsonRPC error: ${JSON.stringify(rpcResult)}`);
	return rpcResult.result;
};

type GasFee = {
	maxFeePerGas: string;
	maxPriorityFeePerGas: string;
};

export const getUserOpGasPrice = async (provider: EthereumProvider, basePriceMultiplier?: bigint): Promise<GasFee> => {
	const feeHistory = await provider.send("eth_feeHistory", ["0x1", "latest", [100]]);
	console.log({ feeHistory });
	const maxPriorityFeePerGas = await provider.send("eth_maxPriorityFeePerGas", []);
	console.log({ maxPriorityFeePerGas });
	return {
		maxFeePerGas: `0x${(BigInt(feeHistory.baseFeePerGas[0]) * (basePriceMultiplier ?? 2n) + BigInt(maxPriorityFeePerGas)).toString(16)}`,
		maxPriorityFeePerGas,
	};
};

type GasLimits = {
	preVerificationGas: string;
	verificationGasLimit: string;
	callGasLimit: string;
	paymasterVerificationGasLimit: string;
	paymasterPostOpGasLimit: string;
};

export const getUserOpGasLimits = async (
	entryPoint: string,
	userOp: PackedUserOperationStruct,
	gasFee?: GasFee,
): Promise<GasLimits> => {
	const serializedUserOp = await serialize(userOp);
	if (gasFee) {
		serializedUserOp.maxFeePerGas = gasFee.maxFeePerGas;
		serializedUserOp.maxPriorityFeePerGas = gasFee.maxPriorityFeePerGas;
	}
	const limits = await call<GasLimits>("eth_estimateUserOperationGas", [serializedUserOp, entryPoint]);
	return limits;
};

export function setGasParams(userOp: PackedUserOperationStruct, gasFee: GasFee, gasLimit: GasLimits) {
	userOp.preVerificationGas = gasLimit.preVerificationGas;
	userOp.gasFees = toBeHex(gasFee.maxPriorityFeePerGas, 16) + toBeHex(gasFee.maxFeePerGas, 16).slice(2);
	userOp.accountGasLimits = toBeHex(gasLimit.preVerificationGas, 16) + toBeHex(gasLimit.callGasLimit, 16).slice(2);
}

export const sendUserOp = async (entryPoint: string, userOp: PackedUserOperationStruct): Promise<string> => {
	const serializedUserOp = await serialize(userOp);
	return await call<string>("eth_sendUserOperation", [serializedUserOp, entryPoint]);
};
