import { toHex } from "viem";

export const SAFE_ABI = [
	"function getOwners() view returns (address[])",
	"function getThreshold() view returns (uint256)",
	"function nonce() view returns (uint256)",
	"function getModulesPaginated(address start, uint256 pageSize) view returns (address[] modules, address next)",
	"function getStorageAt(uint256 offset, uint256 length) view returns (bytes)",
	"function execTransaction(address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signatures)",
];
export const FALLBACK_SLOT =
	"0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5";
export const GUARD_SLOT =
	"0x4a204f620c8c5ccdca3fd54d003badd85ba500436a431f0cbda4f558c93c34c8";
export const SINGLETON_SLOT = toHex(0, { size: 32 });
export const SENTINEL = "0x0000000000000000000000000000000000000001";

export const SAFE_TX_TYPE = {
	SafeTx: [
		{ name: "to", type: "address" },
		{ name: "value", type: "uint256" },
		{ name: "data", type: "bytes" },
		{ name: "operation", type: "uint8" },
		{ name: "safeTxGas", type: "uint256" },
		{ name: "baseGas", type: "uint256" },
		{ name: "gasPrice", type: "uint256" },
		{ name: "gasToken", type: "address" },
		{ name: "refundReceiver", type: "address" },
		{ name: "nonce", type: "uint256" },
	],
};
