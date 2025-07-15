import { type AddressLike, type ContractTransactionResponse, resolveAddress, Signature, type Signer } from "ethers";
import type { EntryPoint, SafeHarbourPaymaster } from "../../typechain-types";
import type { PackedUserOperationStruct } from "../../typechain-types/src/SafeHarbourPaymaster";
import { getUserOpHash } from "./erc4337";

const EIP712_VALIDATOR_CONFIRMATION_TYPE = {
	// "ValidatorConfirmation(address harbour,bytes32 userOpHash)"
	ValidatorConfirmation: [
		{ type: "address", name: "harbour" },
		{ type: "bytes32", name: "userOpHash" },
	],
};

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
	harbour: AddressLike,
	paymaster: SafeHarbourPaymaster,
	userOp: PackedUserOperationStruct,
	validator: Signer,
) {
	const userOpHash = await getUserOpHash(chainId, entryPoint, userOp);
	const validatorSig = Signature.from(
		await validator.signTypedData(
			{
				chainId,
				verifyingContract: await paymaster.getAddress(),
			},
			EIP712_VALIDATOR_CONFIRMATION_TYPE,
			{
				harbour: await resolveAddress(harbour),
				userOpHash,
			},
		),
	);
	userOp.signature = validatorSig.serialized;
}
