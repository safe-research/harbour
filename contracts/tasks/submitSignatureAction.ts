import { getAddress, type Signer } from "ethers";
import type { ActionType, TaskArguments } from "hardhat/types";
import { buildSafeTx, buildSignedUserOp, serialize } from "../test/utils/erc4337";
import { SafeInternationalHarbour__factory } from "../typechain-types";
import type { PackedUserOperationStruct } from "../typechain-types/src/SafeInternationalHarbour";

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

const getUserOpGasPrice = async (): Promise<GasFee> => {
	const fees = await call<{ standard: GasFee }>("pimlico_getUserOperationGasPrice", []);
	return fees.standard;
};

type GasLimits = {
	preVerificationGas: string;
	verificationGasLimit: string;
	callGasLimit: string;
	paymasterVerificationGasLimit: string;
	paymasterPostOpGasLimit: string;
};

const getUserOpGasLimits = async (entryPoint: string, userOp: PackedUserOperationStruct): Promise<GasLimits> => {
	const serializedUserOp = await serialize(userOp);
	const limits = await call<GasLimits>("eth_estimateUserOperationGas", [serializedUserOp, entryPoint]);
	return limits;
};

const sendUserOp = async (
	entryPoint: string,
	userOp: PackedUserOperationStruct,
	gasFee: GasFee,
	limits: GasLimits,
): Promise<string> => {
	const serializedUserOp = await serialize(userOp);
	serializedUserOp.maxFeePerGas = gasFee.maxFeePerGas;
	serializedUserOp.maxPriorityFeePerGas = gasFee.maxPriorityFeePerGas;
	serializedUserOp.preVerificationGas = limits.preVerificationGas;
	serializedUserOp.verificationGasLimit = limits.verificationGasLimit;
	serializedUserOp.callGasLimit = limits.callGasLimit;
	return await call<string>("eth_sendUserOperation", [serializedUserOp, entryPoint]);
};

export const action: ActionType<TaskArguments> = async (taskArgs, hre) => {
	const [hardhatSigner] = await hre.ethers.getSigners();
	const signer = hardhatSigner as unknown as Signer;
	console.log(`Use ${hardhatSigner.address} for signing`);
	const harbourAddress = taskArgs.harbour || (await hre.deployments.get("SafeInternationalHarbour")).address;
	console.log(`Use Harbour at ${harbourAddress}`);
	const safeAddress = getAddress(taskArgs.safe);
	const chainId = taskArgs.chainId || (await hre.ethers.provider.getNetwork()).chainId;
	const safeTx = buildSafeTx(taskArgs.tx);
	console.log({ safeTx });
	const harbour = SafeInternationalHarbour__factory.connect(harbourAddress, signer);
	const supportedEntryPoint = await harbour.SUPPORTED_ENTRYPOINT();
	const { userOp } = await buildSignedUserOp(harbour, signer, chainId, safeAddress, safeTx);
	const gasFee = await getUserOpGasPrice();
	console.log({ gasFee });
	const limits = await getUserOpGasLimits(supportedEntryPoint, userOp);
	console.log({ limits });
	const userOpHash = await sendUserOp(supportedEntryPoint, userOp, gasFee, limits);
	console.log({ userOpHash });
};
