import { ethers } from "ethers";
import { describe, expect, it } from "vitest";
import {
	deserializeSession,
	type Session,
	serializeSession,
	signinToSession,
} from "./session";

// We can't compare some fields directly (like `CryptoKey` instances),
// so we convert the session representation a bit to make it work with
// `expect`.
function expectify(session: Session) {
	return {
		...session,
		encryption: { privateKey: "CryptoKey", publicKey: "CryptoKey" },
		relayer: session.relayer.privateKey,
	};
}

// Work around because the DOM environment that `vitest` sets up is
// not compatible with Ethers.
// <https://github.com/ethers-io/ethers.js/issues/4365>
Object.defineProperty(Uint8Array, Symbol.hasInstance, {
	value(potentialInstance: unknown) {
		return this === Uint8Array
			? Object.prototype.toString.call(potentialInstance) ===
					"[object Uint8Array]"
			: Uint8Array[Symbol.hasInstance].call(this, potentialInstance);
	},
});

describe("session", () => {
	describe("signinToSession", () => {
		it("generates a new fresh session", async () => {
			const signer = ethers.Wallet.createRandom();
			const session1 = await signinToSession({ signer, chainId: 1n });
			const session2 = await signinToSession({ signer, chainId: 1n });
			expect(expectify(session1)).not.toEqual(expectify(session2));
		});

		it("recreated sessions are deterministic", async () => {
			const signer = ethers.Wallet.createRandom();
			const session1 = await signinToSession({ signer, chainId: 1n });
			const session2 = await signinToSession({
				signer,
				chainId: 1n,
				onchain: session1.registration,
			});
			expect(expectify(session1)).toEqual(expectify(session2));
		});

		it("throws for invalid contexts", async () => {
			const signer = ethers.Wallet.createRandom();
			await expect(() =>
				signinToSession({ signer, chainId: 1n, onchain: { context: "0x" } }),
			).rejects.toThrowError();
		});
	});

	describe("serializeSession", () => {
		it("serializes to string", async () => {
			const signer = ethers.Wallet.createRandom();
			const session = await signinToSession({ signer, chainId: 1n });
			const serialized = serializeSession(session);
			expect(serialized).toBeTypeOf("string");
		});
	});

	describe("deserializeSession", () => {
		it("roundtrips a session", async () => {
			const signer = ethers.Wallet.createRandom();
			const session = await signinToSession({ signer, chainId: 1n });
			const serialized = serializeSession(session);
			const deserialized = await deserializeSession(serialized);
			expect(expectify(session)).toEqual(expectify(deserialized));
		});

		it("throws for invalid encodings", async () => {
			await expect(() => deserializeSession("invalid")).rejects.toThrowError();
		});
	});
});
