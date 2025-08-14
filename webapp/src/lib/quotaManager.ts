import { Contract, type ContractRunner } from "ethers";

/** ABI for the QuotaManager contract. */
const QUOTA_MANAGER_ABI = [
	"function FEE_TOKEN() view returns (address feeToken)",
	"function depositTokensForSigner(address signer, uint96 amount)",
	"function quotaStatsForSigner(address signer) view returns (uint96 tokenBalance, uint96 usedQuota, uint48 nextQuotaReset)",
	"function availableFreeQuotaForSigner(address signer) view returns (uint96 availableFreeQuota, uint96 usedSignerQuota, uint48 nextSignerQuotaReset)",
];

function quotaManagerAt(
	quptaManagerAddress: string,
	runner?: ContractRunner,
): Contract {
	return new Contract(quptaManagerAddress, QUOTA_MANAGER_ABI, runner);
}

export { quotaManagerAt };
