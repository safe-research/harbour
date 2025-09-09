import { ethers, type Wallet } from "ethers";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";
import { useBrowserProvider } from "@/hooks/useBrowserProvider";
import { useHarbourRpcProvider } from "@/hooks/useRpcProvider";
import {
	type EncryptionKey,
	fetchEncryptionKey,
	type HarbourContractSettings,
} from "@/lib/harbour";
import {
	deserializeSession,
	type Session,
	serializeSession,
	signinToSession,
} from "@/lib/session";

const STORAGE_KEY_PREFIX = "session.v1";

type Address = string;
type Hex = string;

interface SessionStorageKey {
	chainId: bigint;
	address: Address;
}

interface CryptoKeyPairWithHex extends CryptoKeyPair {
	publicKeyHex: Hex;
}

interface SessionKeys {
	encryption: CryptoKeyPairWithHex;
	relayer: Wallet;
}

interface SessionState {
	session: Session;
	hasPendingRegistration: boolean;
}

interface SessionValue {
	keys: SessionKeys | null;
	pendingRegistration: EncryptionKey | null;
	connect: (settings?: HarbourContractSettings) => void;
	create: (settings?: HarbourContractSettings) => void;
	disconnect: () => void;
	connected: boolean;
	isUpdating: boolean;
	error: Error | null;
}

function storageKeyFor({ chainId, address }: SessionStorageKey): string {
	return `${STORAGE_KEY_PREFIX}:${chainId}@${ethers.getAddress(address)}`;
}

async function loadSession(key: SessionStorageKey): Promise<Session | null> {
	try {
		const storageKey = storageKeyFor(key);
		const encoded = localStorage.getItem(storageKey) ?? "";
		return await deserializeSession(encoded);
	} catch {
		return null;
	}
}

function storeSession(key: SessionStorageKey, session: Session) {
	const storageKey = storageKeyFor(key);
	const encoded = serializeSession(session);
	localStorage.setItem(storageKey, encoded);
}

function onchainMatchesSession(
	onchain: EncryptionKey,
	{ registration }: Pick<Session, "registration">,
) {
	return (
		onchain.context === registration.context &&
		onchain.publicKey === registration.publicKey
	);
}

function isError(o: unknown): o is Error {
	return Object.prototype.toString.call(o) === "[object Error]";
}

const SessionContext = createContext<SessionValue | null>(null);

function SessionProvider({ children }: { children: ReactNode }) {
	const wallet = useBrowserProvider();
	const { provider } = useHarbourRpcProvider();

	const [session, setSession] = useState<SessionState | null>(null);
	const [isUpdating, setIsUpdating] = useState(false);
	const [error, setError] = useState<Error | null>(null);

	const update = useCallback(
		async (handler: () => Promise<SessionState | null>) => {
			setIsUpdating(true);
			setError(null);
			try {
				const session = await handler();
				setSession(session);
			} catch (err) {
				console.error(err);
				setError(isError(err) ? err : new Error(`${err}`));
			} finally {
				setIsUpdating(false);
			}
		},
		[],
	);

	const connect = useCallback(
		(currentSettings?: HarbourContractSettings) =>
			update(async () => {
				if (!wallet || !provider) {
					return null;
				}

				const signer = await wallet.getSigner();
				const address = await signer.getAddress();
				const { chainId } = await provider.getNetwork();
				const onchain = await fetchEncryptionKey(address, currentSettings);
				const session = await loadSession({ chainId, address });
				if (onchain === null || session === null) {
					return null;
				}

				// We need to make sure that the onchain registration (if there
				// is one), matches what we have in local storage, otherwise
				// this means either our local storage copy is outdated and
				// needs to be rotated.
				if (onchain.registered && !onchainMatchesSession(onchain, session)) {
					return null;
				}

				return {
					session,
					hasPendingRegistration: !onchain.registered,
				};
			}),
		[update, wallet, provider],
	);

	const create = useCallback(
		(currentSettings?: HarbourContractSettings) =>
			update(async () => {
				if (!wallet || !provider) {
					throw new Error(
						"Session creation is not available without a connected wallet",
					);
				}

				const signer = await wallet.getSigner();
				const address = await signer.getAddress();
				const { chainId } = await provider.getNetwork();
				const onchain = await fetchEncryptionKey(address, currentSettings);
				const session = await signinToSession({
					signer,
					chainId,
					onchain: onchain?.registered ? onchain : undefined,
				});
				storeSession({ chainId, address }, session);
				return {
					session,
					hasPendingRegistration:
						!onchain?.registered || !onchainMatchesSession(onchain, session),
				};
			}),
		[update, wallet, provider],
	);

	const disconnect = () => {
		setSession(null);
		setError(null);
	};

	const value = {
		connected: session !== null,
		keys: session
			? {
					encryption: {
						...session.session.encryption,
						publicKeyHex: session.session.registration.publicKey,
					},
					relayer: session.session.relayer,
				}
			: null,
		pendingRegistration: session?.hasPendingRegistration
			? session.session.registration
			: null,
		connect,
		create,
		disconnect,
		isUpdating,
		error,
	};

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

export type { SessionKeys, SessionValue };
export { SessionProvider, useSession };
