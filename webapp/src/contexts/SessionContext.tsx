import {
	type BigNumberish,
	type BytesLike,
	ethers,
	type SignatureLike,
	type Signer,
	type Wallet,
} from "ethers";
import { createContext, useContext, type ReactNode } from "react";
import { SiweMessage } from "siwe";

const STORAGE_KEY_PREFIX = "session";
const SESSION_PREFIX = "harbour:session:v1:";

type Address = string;
type Hex = string;

interface Context {
	nonce: Uint8Array;
	issuedAt: Date;
	relayer: Address;
}

type ContextSalt = Pick<Context, "nonce" | "issuedAt">;

interface Session {
	seed: Uint8Array;
	salt: ContextSalt;
}

type SessionSeed = Pick<Session, "seed">;

interface SessionKeys {
	encryption: CryptoKeyPair;
	relayer: Wallet;
}

interface EncryptionKeyRegistration {
	context: BytesLike;
	publicKey: BytesLike;
}

interface PendingSession {
	registration: EncryptionKeyRegistration;
	relayer: Wallet;
}

function storageKeyFor(address: Address): string {
	return `${STORAGE_KEY_PREFIX}.${ethers. getAddress(address)}`;
}

function loadSession(address: Address): Session | null {
	try {
		const storageKey = storageKeyFor(address);
		const encoded = localStorage.getItem(storageKey) ?? "";
		if (!encoded.startsWith(SESSION_PREFIX)) {
			return null;
		}
		const raw = ethers.decodeBase64(encoded.substr(SESSION_PREFIX.length));
		if (raw.length !== 44) {
			return null;
		}

		const seed = raw.subarray(0, 32);
		const salt = decodeContextSalt(raw.subarray(32));

		return { seed, salt };
	} catch {
		return null;
	}
}

function storeSession(address: Address, { seed, salt }: Session) {
	const data = ethers.encodeBase64(
		ethers.concat([seed, encodeContextSalt(salt)]),
	);
	const encoded = `${SESSION_PREFIX}${data}`;
	const storageKey = storageKeyFor(address);
	localStorage.setItem(storageKey, encoded);
}

function deriveSecret(domain: number, { seed }: SessionSeed): Hex {
	return ethers.solidityPackedKeccak256(["uint8", "bytes32"], [domain, seed]);
}

async function deriveEncryptionKeyPair(
	session: SessionSeed,
): Promise<CryptoKeyPair> {
	const secret = deriveSecret(0, session);

	// TODO: we should actually compute the PKCS#8 format, for now just guess based on computed
	// `crypto.subtle.exportKey("pkcs8", privateKey)` for randomly generated `privateKey`s.
	const pkcs8 = ethers.getBytes(
		ethers.concat([
			"0x302e020100300506032b656e04220420", // experimentally determined PKCS#8 header
			secret,
		]),
	);
	const privateKey = await crypto.subtle.importKey(
		"pkcs8",
		pkcs8,
		{ name: "X25519" },
		true,
		["deriveBits"],
	);

	// SubtleCrypto API doesn't have a way to derive a public key from a private key, but the JWK
	// exported private key includes the public key, so make use of it!
	const jwk = await crypto.subtle.exportKey("jwk", privateKey);
	if (!jwk.x) {
		throw new Error("exported key missing public x-coordinate");
	}
	const publicKey = await crypto.subtle.importKey(
		"raw",
		ethers.decodeBase64(jwk.x ?? ""),
		{ name: "X25519" },
		true,
		[],
	);

	return { publicKey, privateKey };
}

function deriveRelayerWallet(session: SessionSeed): Wallet {
	const privateKey = deriveSecret(1, session);
	return new ethers.Wallet(privateKey);
}

async function deriveSessionKeys(session: SessionSeed): Promise<SessionKeys> {
	const encryption = await deriveEncryptionKeyPair(session);
	const relayer = deriveRelayerWallet(session);
	return { encryption, relayer };
}

function bytesEqual(a: BytesLike, b: BytesLike): boolean {
	return ethers.hexlify(a) === ethers.hexlify(b);
}

function generateContextSalt(): ContextSalt {
	return {
		nonce: ethers.randomBytes(6),
		issuedAt: new Date(1000 * Math.floor(Date.now() / 1000)),
	};
}

function deriveSeed(signature: SignatureLike): Uint8Array {
	// We get the EIP-2098 representation of the signature to ensure that we don't have any
	// reproducibility issues related to different signer implementation using high or low `s` values,
	// giving us a canonical signature representation.
	const { r, yParityAndS } = ethers.Signature.from(signature);
	return ethers.getBytes(
		ethers.solidityPackedKeccak256(["bytes32", "bytes32"], [r, yParityAndS]),
	);
}

function encodeContextSalt({ nonce, issuedAt }: ContextSalt): Hex {
	const issuedAtTimestamp = issuedAt.getTime();
	if (issuedAtTimestamp % 1000 !== 0) {
		throw new Error(
			"issuance timestamps with millisencond precision not supported",
		);
	}

	return ethers.solidityPacked(
		["bytes6", "uint48"],
		[nonce, issuedAtTimestamp / 1000],
	);
}

function encodeContext({ issuedAt, nonce, relayer }: Context): Hex {
	return ethers.solidityPacked(
		["bytes12", "address"],
		[encodeContextSalt({ issuedAt, nonce }), relayer],
	);
}

function decodeContextSalt(salt: Uint8Array): ContextSalt {
	if (salt.length !== 12) {
		throw new Error(`invalid encoded context ${ethers.hexlify(salt)}`);
	}

	return {
		nonce: salt.slice(0, 6),
		issuedAt: new Date(ethers.toNumber(salt.subarray(6))),
	};
}

async function encodePublicEncryptionKey(
	publicKey: CryptoKey,
): Promise<Uint8Array> {
	const raw = await crypto.subtle.exportKey("raw", publicKey);
	return new Uint8Array(raw);
}

class SessionManager {
	#session: Session | null = null;

	public get connected(): boolean {
		return this.#session !== null;
	}

	public async getKeys(): Promise<SessionKeys | null> {
		const keys =
			this.#session !== null ? await deriveSessionKeys(this.#session) : null;
		return keys;
	}

	public async connect(
		signer: Signer,
		onchain: EncryptionKeyRegistration,
	): Promise<boolean> {
		const address = await signer.getAddress();
		this.#session = loadSession(address);
		if (this.#session === null) {
			return false;
		}

		// We need to make sure that the onchain registration matches what we have in local storage,
		// otherwise this means either our local storage copy is outdated and needs to be rotated.
		const keys = await deriveSessionKeys(this.#session);
		const context = encodeContext({
			...this.#session.salt,
			relayer: keys.relayer.address,
		});
		const publicKey = await encodePublicEncryptionKey(
			keys.encryption.publicKey,
		);
		if (
			!bytesEqual(context, onchain.context) ||
			!bytesEqual(publicKey, onchain.publicKey)
		) {
			this.#session = null;
		}

		return this.#session !== null;
	}

	public disconnect(): void {
		this.#session = null;
	}

	public async create(
		signer: Signer,
		chainId: BigNumberish,
		register: (pending: PendingSession) => Promise<void>,
	): Promise<void> {
		const address = await signer.getAddress();
		const salt = generateContextSalt();
		const signin = new SiweMessage({
			scheme: window.location.protocol.replace(/:$/, ""),
			domain: window.location.host,
			address,
			statement: "Log into Harbour to access encrypted transaction data",
			uri: window.location.origin,
			version: "1",
			chainId: ethers.toNumber(chainId),
			nonce: ethers.encodeBase58(salt.nonce),
			issuedAt: salt.issuedAt.toISOString(),
		});
		const message = signin.toMessage();
		const signature = await signer.signMessage(message);
		const seed = deriveSeed(signature);
		const session = { seed, salt };
		const { encryption, relayer } = await deriveSessionKeys(session);
		const registration = {
			context: encodeContext({ ...salt, relayer: relayer.address }),
			publicKey: await encodePublicEncryptionKey(encryption.publicKey),
		};
		await register({ registration, relayer });
		storeSession(address, session);
		this.#session = session;
	}
}

const SessionContext = createContext<SessionManager>(new SessionManager());

function SessionProvider({ children }: { children: ReactNode }) {
	const [connection, setConnection] = useState<{ session: Session, keys: SessionKeys } | null>(null);
	const [isPending, startUpdate] = useTransition();


	async function connect(
		signer: Signer,
		onchain: EncryptionKeyRegistration,
	): Promise<boolean> {
		const address = await signer.getAddress();
		const session = loadSession(address);
		if (this.#session === null) {
			return false;
		}

		// We need to make sure that the onchain registration matches what we have in local storage,
		// otherwise this means either our local storage copy is outdated and needs to be rotated.
		const keys = await deriveSessionKeys(this.#session);
		const context = encodeContext({
			...this.#session.salt,
			relayer: keys.relayer.address,
		});
		const publicKey = await encodePublicEncryptionKey(
			keys.encryption.publicKey,
		);
		if (
			!bytesEqual(context, onchain.context) ||
			!bytesEqual(publicKey, onchain.publicKey)
		) {
			this.#session = null;
		}

		return this.#session !== null;
	}

	public disconnect(): void {
		this.#session = null;
	}

	public async create(
		signer: Signer,
		chainId: BigNumberish,
		register: (pending: PendingSession) => Promise<void>,
	): Promise<void> {
		const address = await signer.getAddress();
		const salt = generateContextSalt();
		const signin = new SiweMessage({
			scheme: window.location.protocol.replace(/:$/, ""),
			domain: window.location.host,
			address,
			statement: "Log into Harbour to access encrypted transaction data",
			uri: window.location.origin,
			version: "1",
			chainId: ethers.toNumber(chainId),
			nonce: ethers.encodeBase58(salt.nonce),
			issuedAt: salt.issuedAt.toISOString(),
		});
		const message = signin.toMessage();
		const signature = await signer.signMessage(message);
		const seed = deriveSeed(signature);
		const session = { seed, salt };
		const { encryption, relayer } = await deriveSessionKeys(session);
		const registration = {
			context: encodeContext({ ...salt, relayer: relayer.address }),
			publicKey: await encodePublicEncryptionKey(encryption.publicKey),
		};
		await register({ registration, relayer });
		storeSession(address, session);
		this.#session = session;
}


const value = useMemo(() => ({

}), [session]);
	}
}

function useSession(): SessionManager {
	const context = useContext(SessionContext);
	if (!context) {
		throw new Error("useSession must be used within a SessionContext provider");
	}
	return context;
}



export type {
	EncryptionKeyRegistration,
	PendingSession,
	SessionKeys,
	SessionManager,
};
export { useSession };
