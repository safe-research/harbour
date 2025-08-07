import { type ContractTransactionResponse, Signature, type Signer, ZeroAddress } from "ethers";
import type { EntryPoint } from "../../typechain-types";
import type { PackedUserOperationStruct, QuotaMixinConfigStruct } from "../../typechain-types/src/SafeHarbourPaymaster";
import { signUserOp } from "./erc4337";

export function buildQuotaConfig(params?: Partial<QuotaMixinConfigStruct>): QuotaMixinConfigStruct {
	const feeToken = params?.feeToken ?? ZeroAddress;
	return {
		timeframeQuotaReset: params?.timeframeQuotaReset ?? 24 * 3600, // Per day quota
		requiredQuotaMultiplier: params?.requiredQuotaMultiplier ?? (feeToken === ZeroAddress ? 0 : 1), // Disable quota if no fee token is set
		maxAvailableQuota: params?.maxAvailableQuota ?? 5000,
		feeToken,
		quotaPerFeeToken: params?.quotaPerFeeToken ?? 1000,
		quotaPerFeeTokenScale: params?.quotaPerFeeTokenScale ?? 18,
	};
}

export function calculateNextQuotaReset(
	updateTimestamp: bigint,
	prevNextReset: bigint,
	resetTimeframe: bigint = 24n * 3600n,
): bigint {
	return updateTimestamp - ((updateTimestamp - prevNextReset) % resetTimeframe) + resetTimeframe;
}

export async function calculateNextQuotaResetFromTx(
	updateTx: ContractTransactionResponse,
	prevNextReset: bigint,
	resetTimeframe: bigint = 24n * 3600n,
): Promise<bigint> {
	const updateBlock = await updateTx.getBlock();
	const updateTimestamp = BigInt(updateBlock?.timestamp || 0);
	return calculateNextQuotaReset(updateTimestamp, prevNextReset, resetTimeframe);
}

export async function addValidatorSignature(
	chainId: bigint,
	entryPoint: EntryPoint,
	userOp: PackedUserOperationStruct,
	validator: Signer,
) {
	const validatorSig = Signature.from(await signUserOp(chainId, entryPoint, userOp, validator));
	userOp.signature = validatorSig.serialized;
}
