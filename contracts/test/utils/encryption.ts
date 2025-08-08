import zlib from "node:zlib";
import { x25519 } from "@noble/curves/ed25519";
import { type BytesLike, ethers, type Signer } from "ethers";
import jose, { type GeneralJWE } from "jose";
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

async function deterministicX25519KeyPair(signer: Signer, context: BytesLike): Promise<X25519Key> {
	const siwe = `Fake SIWE ${await signer.getAddress()} ${ethers.hexlify(context)}`;
	const entropy = await signer.signMessage(siwe);
	const { secretKey, publicKey } = x25519.keygen(ethers.getBytes(ethers.keccak256(entropy)));

	// TODO: we should actually compute the PKCS#8 format, for now just guess based on computed
	// `crypto.subtle.exportKey("pkcs8", privateKey)` for randomly generated `privateKey`s.
	const pkcs8 = ethers.getBytes(
		ethers.concat([
			"0x302e020100300506032b656e04220420", // experimentally determined PKCS#8 header
			secretKey,
		]),
	);
	const decryptionKey = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "X25519" }, true, ["deriveBits"]);

	return {
		decryptionKey,
		encryptionKey: ethers.hexlify(publicKey),
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

function encodeJwe(jwe: unknown): string {
	const data = new TextEncoder().encode(JSON.stringify(jwe));
	const compressed = zlib.brotliCompressSync(data);
	return `0x${compressed.toString("hex")}`;
}

function decodeJwe(encryptionBlob: BytesLike): GeneralJWE {
	const data = ethers.getBytes(encryptionBlob);
	const decompressed = zlib.brotliDecompressSync(data);
	const jwe = JSON.parse(new TextDecoder().decode(decompressed));
	return jwe as unknown as GeneralJWE;
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
	return encodeJwe(jwe);
}

async function decryptSafeTransaction(encryptionBlob: BytesLike, decryptionKey: CryptoKey): Promise<SafeTransaction> {
	const jwe = decodeJwe(encryptionBlob);
	const { plaintext } = await jose.generalDecrypt(jwe, decryptionKey);
	return rlpDecodeSafeTransaction(plaintext);
}

export { randomX25519KeyPair, deterministicX25519KeyPair, encryptSafeTransaction, decryptSafeTransaction };
