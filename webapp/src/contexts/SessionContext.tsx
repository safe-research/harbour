import { x25519 } from "@noble/curves/ed25519";
import {
	type BigNumberish,
	type BytesLike,
	ethers,
	type SignatureLike,
	type Wallet,
} from "ethers";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useState,
	useTransition,
} from "react";
import { SiweMessage } from "siwe";
import { useBrowserProvider } from "@/hooks/useBrowserProvider";
import { useHarbourRpcProvider } from "@/hooks/useRpcProvider";
import {
	fetchEncryptionKey,
	type HarbourContractSettings,
} from "@/lib/harbour";

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

interface Entropy {
	seed: Uint8Array;
	salt: ContextSalt;
}

type EntropySeed = Pick<Entropy, "seed">;

interface CryptoKeyPairWithHex extends CryptoKeyPair {
	publicKeyHex: Hex;
}

interface SessionKeys {
	encryption: CryptoKeyPairWithHex;
	relayer: Wallet;
}

interface EncryptionKeyRegistration {
	context: BytesLike;
	publicKey: BytesLike;
}

interface Session {
	entropy: Entropy;
	keys: SessionKeys;
	pendingRegistration: EncryptionKeyRegistration | null;
}

type RetrieveFunction = (
	address: Address,
) => Promise<EncryptionKeyRegistration>;
type ChainIdFunction = () => Promise<BigNumberish>;

interface SessionValue {
	keys: SessionKeys | null;
	pendingRegistration: EncryptionKeyRegistration | null;
	connect: (settings?: HarbourContractSettings) => void;
	create: (settings?: HarbourContractSettings) => void;
	disconnect: () => void;
	connected: boolean;
	isUpdating: boolean;
	error: Error | null;
}

function storageKeyFor(address: Address): string {
	return `${STORAGE_KEY_PREFIX}.${ethers.getAddress(address)}`;
}

function loadSessionEntropy(address: Address): Entropy | null {
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

function storeSessionEntropy(address: Address, { seed, salt }: Entropy) {
	const data = ethers.encodeBase64(
		ethers.concat([seed, encodeContextSalt(salt)]),
	);
	const encoded = `${SESSION_PREFIX}${data}`;
	const storageKey = storageKeyFor(address);
	localStorage.setItem(storageKey, encoded);
}

function deriveSecret(domain: number, { seed }: EntropySeed): Hex {
	return ethers.solidityPackedKeccak256(["uint8", "bytes32"], [domain, seed]);
}

async function deriveEncryptionKeyPair(
	entropy: EntropySeed,
): Promise<CryptoKeyPairWithHex> {
	const secret = deriveSecret(0, entropy);

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
	const publicKeyRaw = x25519.getPublicKey(secret.substr(2));
	const publicKey = await importEncryptionPublicKey(publicKeyRaw);

	return { publicKey, privateKey, publicKeyHex: ethers.hexlify(publicKeyRaw) };
}

function deriveRelayerWallet(entropy: EntropySeed): Wallet {
	const privateKey = deriveSecret(1, entropy);
	return new ethers.Wallet(privateKey);
}

async function deriveSessionKeys(entropy: EntropySeed): Promise<SessionKeys> {
	const encryption = await deriveEncryptionKeyPair(entropy);
	const relayer = deriveRelayerWallet(entropy);
	return { encryption, relayer };
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

async function encodeEncryptionPublicKey(
	publicKey: CryptoKey,
): Promise<Uint8Array> {
	const raw = await crypto.subtle.exportKey("raw", publicKey);
	return new Uint8Array(raw);
}

function decodeContextSalt(salt: Uint8Array): ContextSalt {
	if (salt.length !== 12) {
		throw new Error(`invalid encoded context salt ${ethers.hexlify(salt)}`);
	}

	return {
		nonce: salt.slice(0, 6),
		issuedAt: new Date(ethers.toNumber(salt.subarray(6)) * 1000),
	};
}

function decodeContext(context: Uint8Array): Context {
	if (context.length !== 32) {
		throw new Error(`invalid encoded context ${ethers.hexlify(context)}`);
	}

	const salt = decodeContextSalt(context.subarray(0, 12));
	const relayer = ethers.getAddress(ethers.hexlify(context.subarray(12)));
	return { ...salt, relayer };
}

async function importEncryptionPublicKey(raw: Uint8Array): Promise<CryptoKey> {
	return await crypto.subtle.importKey(
		"raw",
		raw,
		{ name: "X25519" },
		true,
		[],
	);
}

async function decodeEncryptionPublicKey(
	publicKey: BytesLike,
): Promise<CryptoKey | null> {
	if (ethers.hexlify(publicKey) === ethers.ZeroHash) {
		return null;
	}
	try {
		const raw = ethers.getBytes(publicKey);
		return await importEncryptionPublicKey(raw);
	} catch {
		return null;
	}
}

function bytesEqual(a: BytesLike, b: BytesLike): boolean {
	return ethers.hexlify(a) === ethers.hexlify(b);
}

function registrationEquals(
	a: EncryptionKeyRegistration,
	b: EncryptionKeyRegistration,
): boolean {
	return (
		bytesEqual(a.context, b.context) && bytesEqual(a.publicKey, b.publicKey)
	);
}

function isRegistered(registration: EncryptionKeyRegistration): boolean {
	return !registrationEquals(registration, {
		context: ethers.ZeroHash,
		publicKey: ethers.ZeroHash,
	});
}

function isError(o: unknown): o is Error {
	return Object.prototype.toString.call(o) === "[object Error]";
}

const SessionContext = createContext<SessionValue | null>(null);

function SessionProvider({ children }: { children: ReactNode }) {
	const wallet = useBrowserProvider();
	const { provider } = useHarbourRpcProvider();

	const [session, setSession] = useState<Session | null>(null);
	const [error, setError] = useState<Error | null>(null);
	const [isUpdating, startUpdate] = useTransition();

	const update = useCallback((handler: () => Promise<Session | null>) => {
		setError(null);
		startUpdate(async () => {
			try {
				const session = await handler();
				setSession(session);
			} catch (err) {
				console.error(err);
				setSession(null);
				setError(isError(err) ? err : new Error(`${err}`));
			}
		});
	}, []);

	const connect = useCallback(
		(currentSettings?: HarbourContractSettings) =>
			update(async () => {
				if (!wallet || !provider) {
					return null;
				}

				const signer = await wallet.getSigner();
				const address = await signer.getAddress();
				const onchain = await fetchEncryptionKey(address, currentSettings);
				const entropy = loadSessionEntropy(address);
				if (onchain === null || entropy === null) {
					return null;
				}

				const keys = await deriveSessionKeys(entropy);
				const registration = {
					context: encodeContext({
						...entropy.salt,
						relayer: keys.relayer.address,
					}),
					publicKey: await encodeEncryptionPublicKey(keys.encryption.publicKey),
				};

				// We need to make sure that the onchain registration (if there
				// is one), matches what we have in local storage, otherwise
				// this means either our local storage copy is outdated and
				// needs to be rotated.
				if (
					isRegistered(onchain) &&
					!registrationEquals(onchain, registration)
				) {
					return null;
				}

				return {
					entropy,
					keys,
					pendingRegistration: isRegistered(onchain) ? null : registration,
				};
			}),
		[update, wallet, provider],
	);

	const create = useCallback(
		() =>
			update(async () => {
				if (!wallet || !provider) {
					throw new Error(
						"Session creation is not available without a connected wallet",
					);
				}

				const signer = await wallet.getSigner();
				const address = await signer.getAddress();
				const { chainId } = await provider.getNetwork();
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
				const entropy = { seed, salt };
				const keys = await deriveSessionKeys(entropy);
				const pendingRegistration = {
					context: encodeContext({
						...entropy.salt,
						relayer: keys.relayer.address,
					}),
					publicKey: await encodeEncryptionPublicKey(keys.encryption.publicKey),
				};
				storeSessionEntropy(address, entropy);
				return { entropy, keys, pendingRegistration };
			}),
		[update, wallet, provider],
	);

	const disconnect = useCallback(() => {
		setSession(null);
		setError(null);
	}, []);

	const value = useMemo(
		() => ({
			connected: session !== null,
			keys: session?.keys ?? null,
			pendingRegistration: session?.pendingRegistration ?? null,
			connect,
			create,
			disconnect,
			isUpdating,
			error,
		}),
		[session, connect, create, disconnect, isUpdating, error],
	);

	useEffect(() => {
		connect();
	}, [connect]);

	return (
		<SessionContext.Provider value={value}>{children}</SessionContext.Provider>
	);
}

function useSession(): SessionValue {
	const value = useContext(SessionContext);
	if (value === null) {
		throw new Error("useSession must be used within a SessionContext provider");
	}
	return value;
}

export type {
	ChainIdFunction,
	EncryptionKeyRegistration,
	RetrieveFunction,
	SessionKeys,
	SessionValue,
};
export {
	SessionProvider,
	useSession,
	decodeEncryptionPublicKey,
	decodeContext,
};
