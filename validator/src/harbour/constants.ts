import { parseAbi } from "viem";

/** ABI for the Harbour contract. */
export const HARBOUR_ABI = parseAbi([
	"function FEE_TOKEN() view returns (address feeToken)",
	"function SUPPORTED_ENTRYPOINT() view returns (address supportedEntrypoint)",
	"function TRUSTED_PAYMASTER() view returns (address paymaster)",
	"function getNonce(address signer) view returns (uint256 userOpNonce)",
	"function depositTokensForSigner(address signer, uint128 amount)",
	"function quotaStatsForSigner(address signer) view returns (uint128 tokenBalance, uint64 usedQuota, uint64 nextQuotaReset)",
	"function availableFreeQuotaForSigner(address signer) view returns (uint64 availableFreeQuota, uint64 usedSignerQuota, uint64 nextSignerQuotaReset)",
	"function storeTransaction(bytes32 safeTxHash, address safeAddress, uint256 chainId, uint256 nonce, address to, uint256 value, bytes calldata data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, address signer, bytes32 r, bytes32 vs) external returns (uint256 listIndex)",
	"function enqueueTransaction(address safeAddress, uint256 chainId, uint256 nonce, address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signature) external",
]);
