import { Contract, type ContractRunner } from "ethers";

/** ABI for the QuotaManager contract. */
const QUOTA_MANAGER_ABI = [
	"function FEE_TOKEN() view returns (address feeToken)",
	"function depositTokensForSigner(address signer, uint128 amount)",
	"function quotaStatsForSigner(address signer) view returns (uint128 tokenBalance, uint64 usedQuota, uint64 nextQuotaReset)",
	"function availableFreeQuotaForSigner(address signer) view returns (uint64 availableFreeQuota, uint64 usedSignerQuota, uint64 nextSignerQuotaReset)",
];

function quotaManagerAt(
	quptaManagerAddress: string,
	runner?: ContractRunner,
): Contract {
	return new Contract(quptaManagerAddress, QUOTA_MANAGER_ABI, runner);
}

export { quotaManagerAt };
