import { ethers } from "ethers";

interface X25519Key {
	readonly decryptionKey: CryptoKey;
	readonly encryptionKey: string;
}

async function randomX25519KeyPair(): Promise<X25519Key> {
	const keyPair = await crypto.subtle.generateKey({ name: "X25519" }, true, ["deriveBits"]);
	const { publicKey, privateKey } = keyPair as CryptoKeyPair;
	return {
		decryptionKey: privateKey,
		encryptionKey: await exportX25519PublicKey(publicKey),
	};
}

async function exportX25519PublicKey(publicKey: CryptoKey): Promise<string> {
	const raw = await crypto.subtle.exportKey("raw", publicKey);
	return ethers.hexlify(new Uint8Array(raw));
}

export { randomX25519KeyPair };
