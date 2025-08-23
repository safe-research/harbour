import { describe, expect, it } from "vitest";
import {
	bytes32ToAddress,
	getChecksummedAddress,
	getShortAddress,
	compactSignatureToFullSignature,
} from "./encoding";
import { ethers } from "ethers";
import type { HarbourSignature } from "./types";

describe("encoding", () => {
	const LOWER = "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef";
	const CHECKSUM = "0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF";
	const SHORT = "0xDeaD...beeF"

	describe("addresses", () => {
		it("returns checksummed address", () => {
			expect(getChecksummedAddress(LOWER)).toBe(CHECKSUM);
		});

		it("returns short address", () => {
			expect(getShortAddress(LOWER)).toBe(SHORT);
		});

		// Build a bytes32 where the last 20 bytes encode our address.
		const bytes32 = "0x" + "0".repeat(24) + LOWER.slice(2); // 2 + 24 + 40 = 66 chars total

		it("converts bytes32 to checksummed address", () => {
			expect(bytes32ToAddress(bytes32)).toBe(CHECKSUM);
		});

		it("can return a non-checksummed address", () => {
			expect(bytes32ToAddress(bytes32, { checksum: false })).toBe(LOWER);
		});

		it("throws on invalid bytes32 length", () => {
			const bad = "0x" + "0".repeat(63); // 65 chars
			expect(() => bytes32ToAddress(bad)).toThrowError(
				"Invalid bytes32 length",
			);
		});
	});

	describe("signatures", () => {
		it("converts r + vs to a full signature", async () => {
			// Deterministic wallet (Hardhat default key)
			// address: 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
			// pk: 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
			const wallet = new ethers.Wallet(
				"0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
			);

			// Any message works; we just need a valid signature to decompose/compose.
			const sigHex = await wallet.signMessage("harbour-test");
			const sig = ethers.Signature.from(sigHex);

			const compact: HarbourSignature = {
				r: sig.r,
				vs: sig.yParityAndS, // EIP-2098 compact representation
				txHash: "0x",
				signer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
			};

			const full = compactSignatureToFullSignature(compact);
			expect(full).toBe(sig.serialized); // matches ethers' normalized 65-byte signature
		});
	});
});
