import { x25519 } from "@noble/curves/ed25519";
import { type BytesLike, ethers } from "ethers";
import { GeneralEncrypt, generalDecrypt, type Recipient } from "jose";
import type { SafeTransaction } from "./types";

type Hex = string;

/**
 * Import a raw x25519 private key to a Crypto Subtle key pair.
 */
async function importKeyPair(secret: BytesLike): Promise<CryptoKeyPair> {
	if (ethers.dataLength(secret) !== 32) {
		throw new Error("invalid raw x25519 private key");
	}

	// Because x25519 private keys are always 32 bytes, we can pretty trivially
	// PKCS #8 encode the private key in ASN.1 BER[1] format for importing the
	// private key with the Crypto Subtle API by just contenating a prefix to
	// the raw private key bytes (`#xx` represent byte lengths):
	//
	// 30 #2e             - `PrivateKeyInfo`[2] constructed sequence
	//   02 #01 00        - `version` value of 0
	//   30 #05           - `AlgorithmIdentifier`[3] constructed sequence
	//     06 #03 2b656e  - The algorithm object identifier for x25519[4]
	//   04 #22]           - `PrivateKey` octet string
	//     04 #20 <KEY>   - For x25519, the BER encoded 32-byte octet string
	//
	// [1]: <https://en.wikipedia.org/wiki/X.690>
	// [2]: <https://datatracker.ietf.org/doc/html/rfc5208#section-5>
	// [3]: <https://datatracker.ietf.org/doc/html/rfc5280#section-4.1.1.2>
	// [4]: <https://datatracker.ietf.org/doc/html/rfc8410#section-3>
	const pkcs8 = ethers.getBytes(
		ethers.concat(["0x302e020100300506032b656e04220420", secret]),
	);
	const privateKey = await crypto.subtle.importKey(
		"pkcs8",
		pkcs8,
		{ name: "X25519" },
		false,
		["deriveBits"],
	);

	// Unfortunately, Crypto Subtle API does not have a good way to derive an
	// X25519 public key from a private one - exporting as `jwk` from a PKCS #8
	// imported private key does not work across browsers. Use `@noble/curves`
	// to compute the raw public key instead.
	const publicKeyRaw = x25519.getPublicKey(ethers.getBytes(secret));
	const publicKey = await importPublicKey(publicKeyRaw);

	return { publicKey, privateKey };
}

/**
 * Import a raw x25519 public key to a Crypto Subtle key.
 */
async function importPublicKey(raw: BytesLike): Promise<CryptoKey> {
	if (ethers.dataLength(raw) !== 32) {
		throw new Error("invalid raw x25519 public key");
	}
	return await crypto.subtle.importKey(
		"raw",
		ethers.getBytes(raw),
		{ name: "X25519" },
		true,
		[],
	);
}

/**
 * Exports a public key to its raw bytes.
 */
async function exportPublicKey({
	publicKey,
}: Pick<CryptoKeyPair, "publicKey">): Promise<Hex> {
	const raw = await crypto.subtle.exportKey("raw", publicKey);
	return ethers.hexlify(new Uint8Array(raw));
}

/**
 * RLP-encode a Safe transaction for encryption.
 */
function rlpEncodeSafeTransaction(safeTx: SafeTransaction): Uint8Array {
	const n = ethers.toBeArray;
	return ethers.getBytes(
		ethers.encodeRlp([
			safeTx.to,
			n(safeTx.value),
			safeTx.data,
			n(safeTx.operation),
			n(safeTx.safeTxGas),
			n(safeTx.baseGas),
			n(safeTx.gasPrice),
			safeTx.gasToken,
			safeTx.refundReceiver,
		]),
	);
}

/**
 * RLP-decode a Safe transaction for decryption.
 */
function rlpDecodeSafeTransaction(data: BytesLike): SafeTransaction {
	const decoded = ethers.decodeRlp(data);
	if (
		!Array.isArray(decoded) ||
		decoded.length !== 9 ||
		decoded.some((field) => typeof field !== "string")
	) {
		throw new Error("invalid Safe transaction RLP encoding");
	}
	const fields = decoded as string[];

	const a = ethers.getAddress;
	const n = (field: string) =>
		field === "0x"
			? "0x0"
			: ethers.toQuantity(BigInt(ethers.toBeHex(field, 32)));
	const o = (field: string) => {
		const value = n(field);
		if (value === "0x0") {
			return 0;
		}
		if (value === "0x1") {
			return 1;
		}
		throw new Error(`invalid Safe operation ${BigInt(field)}`);
	};

	return {
		to: a(fields[0]),
		value: n(fields[1]),
		data: fields[2],
		operation: o(fields[3]),
		safeTxGas: n(fields[4]),
		baseGas: n(fields[5]),
		gasPrice: n(fields[6]),
		gasToken: a(fields[7]),
		refundReceiver: a(fields[8]),
	};
}

/**
 * Encrypt a Safe transaction for submission to Secret Harbour.
 */
async function encryptSafeTransaction(
	transaction: SafeTransaction,
	{ privateKey }: Pick<CryptoKeyPair, "privateKey">,
	recipientPublicKeys: CryptoKey[],
): Promise<Hex> {
	// TODO: `jose` generates a random x25519 private key per receiver for
	// encrypting the symmetric encryption key. In our case, this is wasteful as
	// we already have a private x25519 that we generate with our session, and
	// we can use it for doing ECDH, meaning that we no longer need to include
	// the x25519 key information in JWE blob. For our demo, and to write less
	// code, lets just be wasteful...
	// @ts-ignore
	const _todo = privateKey;

	const encoded = rlpEncodeSafeTransaction(transaction);
	let builder: GeneralEncrypt | Recipient = new GeneralEncrypt(
		encoded,
	).setProtectedHeader({
		enc: "A256GCM",
	});
	for (const publicKey of recipientPublicKeys) {
		builder = builder
			.addRecipient(publicKey)
			.setUnprotectedHeader({ alg: "ECDH-ES+A256KW" });
	}
	const jwe = await builder.encrypt();
	const json = JSON.stringify(jwe);
	return ethers.hexlify(ethers.toUtf8Bytes(json));
}

/**
 * Decrypt a Safe transaction from Secret Harbour.
 */
async function decryptSafeTransaction(
	encryptionBlob: BytesLike,
	{ privateKey }: Pick<CryptoKeyPair, "privateKey">,
) {
	const json = ethers.toUtf8String(encryptionBlob);
	const jwe = JSON.parse(json);
	const { plaintext } = await generalDecrypt(jwe, privateKey);
	return rlpDecodeSafeTransaction(plaintext);
}

export {
	importKeyPair,
	importPublicKey,
	exportPublicKey,
	encryptSafeTransaction,
	decryptSafeTransaction,
};
