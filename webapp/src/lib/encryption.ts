import { type BytesLike, ethers } from "ethers";
import * as jose from "jose";

import type { SafeTransaction } from "./types";

/**
 * @param safeTx - The Safe transaction to encode
 * @returns The RLP encoded Safe transaction
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
 * @param data - The RLP data to decode
 * @returns The decoded Safe transaction
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

function encodeJwe(jwe: jose.GeneralJWE) {
	const data = new TextEncoder().encode(JSON.stringify(jwe));
	return ethers.hexlify(data);
}

function decodeJwe(encryptionBlob: BytesLike) {
	const data = ethers.getBytes(encryptionBlob);
	const jwe = JSON.parse(new TextDecoder().decode(data));
	// TODO: This should be validated with a Zod schema. Note that `jose`
	// already internally checks the JWE is well-formed, but still...
	return jwe as unknown as jose.GeneralJWE;
}

async function encryptSafeTransaction(
	transaction: SafeTransaction,
	encryptionKey: CryptoKeyPair,
	recipientPublicKeys: CryptoKey[],
) {
	// TODO: `jose` generates a random x25519 private key per receiver for
	// encrypting the symmetric encryption key. In our case, this is wasteful as
	// we already have a private x25519 that we generate with our session, and
	// we can use it for doing ECDH, meaning that we no longer need to include
	// the x25519 key information in JWE blob. For our demo, and to write less
	// code, lets just be wasteful...
	// @ts-ignore
	const _todo = encryptionKey;

	const encoded = rlpEncodeSafeTransaction(transaction);
	const encrypt = new jose.GeneralEncrypt(encoded).setProtectedHeader({
		enc: "A256GCM",
	});

	let builder: jose.GeneralEncrypt | jose.Recipient = encrypt;
	for (const publicKey of recipientPublicKeys) {
		builder = builder
			.addRecipient(publicKey)
			.setUnprotectedHeader({ alg: "ECDH-ES+A256KW" });
	}

	const jwe = await builder.encrypt();
	return encodeJwe(jwe);
}

async function decryptSafeTransaction(
	encryptionBlob: BytesLike,
	privateEncryptionKey: CryptoKey,
) {
	const jwe = decodeJwe(encryptionBlob);
	const { plaintext } = await jose.generalDecrypt(jwe, privateEncryptionKey);
	return rlpDecodeSafeTransaction(plaintext);
}

export { encryptSafeTransaction, decryptSafeTransaction };
