import { ethers } from "ethers";
import { describe, expect, it } from "vitest";
import {
	decryptSafeTransaction,
	encryptSafeTransaction,
	exportPublicKey,
	importKeyPair,
	importPublicKey,
} from "./encryption";

describe("encryption", () => {
	describe("importKeyPair", () => {
		it("returns the correct public key", async () => {
			const testing = (await crypto.subtle.generateKey(
				{ name: "X25519" },
				true,
				["deriveBits"],
			)) as CryptoKeyPair;
			const { d } = await crypto.subtle.exportKey("jwk", testing.privateKey);
			const secret = `0x${Buffer.from(d as string, "base64").toString("hex")}`;

			const { publicKey } = await importKeyPair(secret);
			const hex = (a: ArrayBuffer) => ethers.hexlify(new Uint8Array(a));
			expect(hex(await crypto.subtle.exportKey("raw", publicKey))).toBe(
				hex(await crypto.subtle.exportKey("raw", testing.publicKey)),
			);
		});

		it("does not allow exporting private key", async () => {
			const { privateKey } = await importKeyPair(ethers.randomBytes(32));
			await expect(() =>
				crypto.subtle.exportKey("jwk", privateKey),
			).rejects.toThrowError();
		});

		it("throws for invalid keys", async () => {
			await expect(() =>
				importKeyPair(ethers.randomBytes(42)),
			).rejects.toThrowError();
		});
	});

	describe("importPublicKey", () => {
		it("imports a public key", async () => {
			const publicKey = await importPublicKey(ethers.randomBytes(32));
			expect(publicKey).toBeInstanceOf(CryptoKey);
		});

		it("throws for invalid keys", async () => {
			await expect(() =>
				importPublicKey(ethers.randomBytes(42)),
			).rejects.toThrowError();
		});
	});

	describe("exportPublicKey", () => {
		it("roundtrips a public key", async () => {
			const publicKey = ethers.hexlify(ethers.randomBytes(32));
			const roundtrip = await exportPublicKey({
				publicKey: await importPublicKey(publicKey),
			});
			expect(roundtrip).toBe(publicKey);
		});
	});

	describe("encryptSafeTransaction", () => {
		it("encrypts a Safe transaction", async () => {
			const encryptionKey = await importKeyPair(ethers.randomBytes(32));
			const recipients = [
				await importPublicKey(ethers.randomBytes(32)),
				await importPublicKey(ethers.randomBytes(32)),
				await importPublicKey(ethers.randomBytes(32)),
			];
			const encryptionBlob = await encryptSafeTransaction(
				{
					to: ethers.ZeroAddress,
					value: "0x0",
					data: "0x",
					operation: 0,
					safeTxGas: "0x0",
					baseGas: "0x0",
					gasPrice: "0x0",
					gasToken: ethers.ZeroAddress,
					refundReceiver: ethers.ZeroAddress,
				},
				encryptionKey,
				recipients,
			);
			expect(encryptionBlob).toMatch(/0x([0-9a-f]{2})+/);
		});

		it("throws for invalid keys", async () => {
			await expect(() =>
				importPublicKey(ethers.randomBytes(42)),
			).rejects.toThrowError();
		});
	});

	describe("decryptSafeTransaction", () => {
		it("roundtrips an encrypted Safe transaction", async () => {
			const randomAddress = () =>
				ethers.getAddress(ethers.hexlify(ethers.randomBytes(20)));
			const transaction = {
				to: randomAddress(),
				value: ethers.toQuantity(ethers.parseEther("1")),
				data: ethers.hexlify(ethers.randomBytes(42)),
				operation: 1,
				safeTxGas: ethers.toQuantity(2n),
				baseGas: ethers.toQuantity(3n),
				gasPrice: ethers.toQuantity(4n),
				gasToken: randomAddress(),
				refundReceiver: randomAddress(),
			};
			const signerKeys = [
				await importKeyPair(ethers.randomBytes(32)),
				await importKeyPair(ethers.randomBytes(32)),
				await importKeyPair(ethers.randomBytes(32)),
				await importKeyPair(ethers.randomBytes(32)),
			];

			const encryptionKey = signerKeys[0];
			const recipients = signerKeys.slice(1).map((k) => k.publicKey);

			// Because of a limitation of the current implementation, the
			// encrypting party is _also_ expected to encrypt the Safe
			// transaction for themselves, even though we can design the
			// encryption such that that is not strictly necessary. At that
			// point, this line should be removed. See TODO in
			// `encryptSafeTransaction`.
			recipients.push(encryptionKey.publicKey);

			const encryptionBlob = await encryptSafeTransaction(
				transaction,
				encryptionKey,
				recipients,
			);

			for (const decryptionKey of signerKeys) {
				const decrypted = await decryptSafeTransaction(
					encryptionBlob,
					decryptionKey,
				);
				expect(decrypted).toEqual(transaction);
			}
		});

		it("throws when not a recipient", async () => {
			const { publicKey, privateKey } = await importKeyPair(
				ethers.randomBytes(32),
			);
			const eve = await importKeyPair(ethers.randomBytes(32));
			const encryptionBlob = await encryptSafeTransaction(
				{
					to: ethers.ZeroAddress,
					value: "0x0",
					data: "0x",
					operation: 0,
					safeTxGas: "0x0",
					baseGas: "0x0",
					gasPrice: "0x0",
					gasToken: ethers.ZeroAddress,
					refundReceiver: ethers.ZeroAddress,
				},
				{ privateKey },
				[publicKey],
			);
			await expect(() =>
				decryptSafeTransaction(encryptionBlob, eve),
			).rejects.toThrowError();
		});
	});
});
