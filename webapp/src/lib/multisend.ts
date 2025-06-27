import { ethers } from "ethers";
import type { MetaTransaction } from "./types";

const MULTISEND_CALL_ONLY_ADDRESS =
	"0x9641d764fc13c8B624c04430C7356C1C7C8102e2";

function encodeMetaTransaction(tx: MetaTransaction): string {
	const data = ethers.getBytes(tx.data);
	const encoded = ethers.solidityPacked(
		["uint8", "address", "uint256", "uint256", "bytes"],
		[0, tx.to, tx.value, data.length, data],
	);
	return encoded.slice(2);
}

function encodeMultiSend(txs: MetaTransaction[]): string {
	return `0x${txs.map((tx) => encodeMetaTransaction(tx)).join("")}`;
}

export { MULTISEND_CALL_ONLY_ADDRESS, encodeMultiSend };
