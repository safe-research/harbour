import zlib from "node:zlib";
import { type BytesLike, ethers } from "ethers";
import jose from "jose";
import { rlpDecodeSafeTransaction, rlpEncodeSafeTransaction, type SafeTransaction } from "./safeTx";

type PublicKey = string;

interface X25519Key {
	readonly decryptionKey: CryptoKey;
	readonly encryptionKey: PublicKey;
}

async function randomX25519KeyPair(): Promise<X25519Key> {
	const keyPair = await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"]);
	const { publicKey, privateKey } = keyPair as CryptoKeyPair;
	return {
		decryptionKey: privateKey,
		encryptionKey: await exportX25519PublicKey(publicKey),
	};
}

async function exportX25519PublicKey(publicKey: CryptoKey): Promise<PublicKey> {
	const raw = await crypto.subtle.exportKey("raw", publicKey);
	return ethers.hexlify(new Uint8Array(raw));
}

async function importX25519PublicKey(publicKey: PublicKey): Promise<CryptoKey> {
	const raw = ethers.getBytes(publicKey);
	const key = await crypto.subtle.importKey("raw", raw, { name: "X25519" }, true, []);
	return key;
}

async function encryptSafeTransaction(safeTx: SafeTransaction, recipients: PublicKey[]): Promise<string> {
	const encoded = ethers.getBytes(rlpEncodeSafeTransaction(safeTx));
	const encrypt = new jose.GeneralEncrypt(encoded).setProtectedHeader({ enc: "A256GCM" });

	let builder = null;
	for (const recipient of recipients) {
		const publicKey = await importX25519PublicKey(recipient);
		builder = (builder ?? encrypt).addRecipient(publicKey).setUnprotectedHeader({ alg: "ECDH-ES+A256KW" });
	}

	const jwe = await (builder ?? encrypt).encrypt();
	const data = new TextEncoder().encode(JSON.stringify(jwe));
	const compressed = zlib.brotliCompressSync(data);

	return `0x${compressed.toString("hex")}`;
}

async function decryptSafeTransaction(encryptedSafeTx: BytesLike, decryptionKey: CryptoKey): Promise<SafeTransaction> {
	const data = ethers.getBytes(encryptedSafeTx);
	const decompressed = zlib.brotliDecompressSync(data);
	const jwe = JSON.parse(new TextDecoder().decode(decompressed));
	const { plaintext } = await jose.generalDecrypt(jwe, decryptionKey);
	return rlpDecodeSafeTransaction(plaintext);
}

export { randomX25519KeyPair, encryptSafeTransaction, decryptSafeTransaction };
