import { x25519, ed25519 } from "@noble/curves/ed25519";
import { ethers, type Contract, type Signer, type BytesLike } from "ethers";
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { SwieMessage } from "siwe";
import { HARBOUR_CHAIN_ID } from "@/lib/harbour";

const STORAGE_KEY = "session_key.secret";
const PREFIX = "harbour:session:v1:";

interface Session {
	readonly encryption: CryptoKeyPair;
	readonly relayer: ethers.Wallet;
}

async function loadFromStorage() : null {
    try {
        const encoded = localStorage.getItem(STORAGE_KEY);
        if (!encoded.startsWith(PREFIX)) {
            return null;
        }
        const raw = ethers.decodeBase64(encoded.substr(PREFIX.length));
        if (!raw.length === 44) {
            return null;
        }

        const salt = raw.subarray(0, 12);
        const seed = raw.subarray(12);

        const encryptionPrivateKey = ethers.
    } catch {
        return null;
    }
}

function derivePrivateKey(domain: number, seed: BytesLike): Uint8Array {
    return ethers.getBytes(ethers.solidityPackedKeccak256(["uint8", "bytes32"], [domain, seed]));
}

async function getEncryptionKeyPair(seed: Uint8Array) {
    const pk = derivePrivateKey(0, seed);

}

export class SessionManager {
    private session?: Session;

    async login(harbour: Contract, signer: Signer): Promise<void> {
        const address = await signer.getAddress();
        const [registeredContext, registeredPublicKey] = await harbour.getEncryptionKey(address);

        const [localContext,] =
        const context = {
            nonce: Number(ethers.toBigInt(ethers.randomBytes(6))),
            issuedAt: ~~(Date.now() / 1000),
        }
        const address = await signer.getAddress();
        const message = new siwe.SiweMessage({
            scheme: window.location.protocol.replace(/:$/, ""),
            domain: window.location.host,
            address,
            uri: window.location.origin,
            version: '1',
            chainId: `${HARBOUR_CHAIN_ID}`
        });
    }
}

const SessionContext = createContext<SessionManager>(new SessionManager());

function useSession(): SessionKey | null {
	const context = useContext(WakuContext);
	if (!context) {
		throw new Error("useWaku must be used within a WakuProvider");
	}
	return context;
}

export { WakuProvider, useWaku };
