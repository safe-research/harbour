import { parseAbi, parseAbiParameters } from "viem";

/** ABI for the Harbour contract. */
export const HARBOUR_ABI = parseAbi([
	"function SUPPORTED_ENTRYPOINT() view returns (address supportedEntrypoint)",
	"function getNonce(address signer) view returns (uint256 userOpNonce)",
	"function executeUserOp(PackedUserOperation userOp,bytes32 userOpHash) external",
	"function enqueueTransaction(address safeAddress, uint256 chainId, uint256 nonce, address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signature) external",
	"struct PackedUserOperation { address sender; uint256 nonce; bytes initCode; bytes callData; bytes32 accountGasLimits; uint256 preVerificationGas; bytes32 gasFees; bytes paymasterAndData; bytes signature; }",
]);

export const ENQUEUE_SAFE_TX = parseAbiParameters(
	"bytes32 safeTxHash, address safeAddress, uint256 chainId, uint256 nonce, address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, address signer, bytes32 r, bytes32 vs",
);
