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
	// private key with the Crypto Subtle API by just concatenating a prefix to
	// the raw private key bytes (`#xx` represent byte lengths):
	//
	// 30 #2e             - `PrivateKeyInfo`[2] constructed sequence
	//   02 #01 00        - `version` value of 0
	//   30 #05           - `AlgorithmIdentifier`[3] constructed sequence
	//     06 #03 2b656e  - The algorithm object identifier for x25519[4]
	//   04 #22           - `PrivateKey` octet string
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
	const quantityToField = ethers.toBeArray;
	const operationToField = ethers.toBeArray;
	return ethers.getBytes(
		ethers.encodeRlp([
			safeTx.to,
			quantityToField(safeTx.value),
			safeTx.data,
			operationToField(safeTx.operation),
			quantityToField(safeTx.safeTxGas),
			quantityToField(safeTx.baseGas),
			quantityToField(safeTx.gasPrice),
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

	const fieldToAddress = ethers.getAddress;
	const fieldToQuantity = (field: string) =>
		field === "0x"
			? "0x0"
			: ethers.toQuantity(BigInt(ethers.toBeHex(field, 32)));
	const fieldToOperation = (field: string) => {
		const value = fieldToQuantity(field);
		if (value === "0x0") {
			return 0;
		}
		if (value === "0x1") {
			return 1;
		}
		throw new Error(`invalid Safe operation ${BigInt(field)}`);
	};

	return {
		to: fieldToAddress(fields[0]),
		value: fieldToQuantity(fields[1]),
		data: fields[2],
		operation: fieldToOperation(fields[3]),
		safeTxGas: fieldToQuantity(fields[4]),
		baseGas: fieldToQuantity(fields[5]),
		gasPrice: fieldToQuantity(fields[6]),
		gasToken: fieldToAddress(fields[7]),
		refundReceiver: fieldToAddress(fields[8]),
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
	// TODO: `jose` generates a random ephemeral x25519 private key
	// per recipient for encrypting the symmetric encryption key. In
	// our case, this is wasteful as we already have a private x25519
	// that we generate with our session and is public onchain. We
	// should eventually change our encryption routine to do ECDH
	// directly with our session private key, which would allow us to
	// include one less recipient (we would no longer need to encrypt
	// for "self"), and not encode the ephemeral public key per
	// recipient in the JWE blob (the recipients can read our public
	// key from Secret Harbour). This woud reduce the overall size of
	// what we need to store with Secret Harbour.
	// @ts-expect-error
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
