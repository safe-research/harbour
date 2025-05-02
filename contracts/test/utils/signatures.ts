import { ethers } from "ethers";

/**
 * Splits a 65-byte ECDSA signature into its r and vs (EIP-2098 compact) components.
 *
 * @param {string | Uint8Array} signature - The 65-byte ECDSA signature to split.
 * @returns {{ r: string; vs: string }} An object containing the r and vs (yParityAndS) components.
 */
function toCompactSignature(signature: string): { r: string; vs: string } {
	const compactSignature = ethers.Signature.from(signature);
	return {
		r: compactSignature.r,
		vs: compactSignature.yParityAndS,
	};
}

export { toCompactSignature };
