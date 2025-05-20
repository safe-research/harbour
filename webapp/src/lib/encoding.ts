import { ethers } from "ethers";
import type { HarbourSignature } from "./types";

/**
 * Returns the checksummed version of an Ethereum address using ethers.js.
 * @param address - The Ethereum address to checksum.
 * @returns The checksummed Ethereum address.
 */
function getChecksummedAddress(address: string): string {
	return ethers.getAddress(address);
}

/**
 * Converts a bytes32 string to an Ethereum address.
 * @param bytes32 - The bytes32 string to convert.
 * @param opts - Options object. If opts.checksum is true, returns a checksummed address.
 * @returns The Ethereum address derived from the bytes32 string.
 * @throws If the input is not a valid bytes32 string.
 */
function bytes32ToAddress(bytes32: string, opts: { checksum: boolean } = { checksum: true }): string {
	if (bytes32.length !== 66) {
		throw new Error("Invalid bytes32 length");
	}

	const sliceStart = bytes32.startsWith("0x") ? 26 : 24;
	if (opts.checksum) {
		return ethers.getAddress(`0x${bytes32.slice(sliceStart)}`);
	}

	return `0x${bytes32.slice(sliceStart)}`;
}

/**
 * Converts a compact HarbourSignature to a full EIP-2098 signature string.
 * @param signature - The HarbourSignature object containing r and vs values.
 * @returns The full EIP-2098 signature string.
 */
function compactSignatureToFullSignature(signature: HarbourSignature): string {
	return ethers.Signature.from({
		r: signature.r,
		yParityAndS: signature.vs,
	}).serialized;
}

export { bytes32ToAddress, getChecksummedAddress, compactSignatureToFullSignature };
