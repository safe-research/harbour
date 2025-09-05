import {
	ethers,
	Signature,
	type SignatureLike,
	type Signer,
	Wallet,
} from "ethers";
import { SiweMessage } from "siwe";
import { z } from "zod";
import { exportPublicKey, importKeyPair } from "@/lib/encryption";
import type { EncryptionKey } from "@/lib/harbour";

type Address = string;
type Hex = string;

const sessionTokenSchema = z.object({
	type: z.literal("harbour:session:v1"),
	seed: z.string().regex(/^0x[0-9a-f]{64}$/),
	nonce: z
		.string()
		.regex(/^[1-9A-HJ-NP-Za-km-z]{6,9}$/)
		.refine(
			(arg) => ethers.decodeBase58(arg) <= 0xffffffffffffn,
			"invalid session nonce size",
		)
		.transform((arg) => ethers.toBeHex(ethers.decodeBase58(arg), 6)),
	issuedAt: z
		.string()
		.datetime()
		.regex(/\.000Z$/)
		.transform((arg) => new Date(Date.parse(arg))),
});

/**
 * A serializable session token that can be used to recreate a session.
 */
type SessionToken = z.infer<typeof sessionTokenSchema>;

/**
 * The salt for generating the session seed deterministically from a wallet.
 * These values get included in the Signin With Ethereum message whose signature
 * is used for deriving the session seed. Given a specific salt and wallet, the
 * seed is deterministically generated.
 */
type SessionSalt = Pick<SessionToken, "nonce" | "issuedAt">;

/**
 * A local session for interacting with Secret Harbour.
 */
interface Session {
	token: SessionToken;
	encryption: CryptoKeyPair;
	relayer: Wallet;
	registration: EncryptionKey;
}

interface GenerateSessionParams {
	signer: Pick<Signer, "getAddress" | "signMessage">;
	chainId: bigint;
	onchain?: Pick<EncryptionKey, "context">;
}

/**
 * Login to a new session with a signer. Optionally an existing encryption key
 * that was stored onchain on Secret Harbour in order to re-create a session.
 */
async function signinToSession({
	signer,
	chainId,
	onchain,
}: GenerateSessionParams): Promise<Session> {
	const address = await signer.getAddress();
	const salt = onchain ? decodeSalt(onchain.context) : newSalt();
	const signin = new SiweMessage({
		scheme: window.location.protocol.replace(/:$/, ""),
		domain: window.location.host,
		address,
		statement: "Log into Harbour to access encrypted transaction data",
		uri: window.location.origin,
		version: "1",
		chainId: ethers.toNumber(chainId),
		// SIWE has a minimum nonce length of 8 characters, so pad the encoded
		// nonce with `0`s - which is not a valid base58 character.
		nonce: ethers.encodeBase58(salt.nonce).padEnd(8, "0"),
		issuedAt: salt.issuedAt.toISOString(),
	});
	const message = signin.toMessage();
	const signature = await signer.signMessage(message);
	const seed = deriveSeed(signature);
	return deriveSession({ type: "harbour:session:v1", seed, ...salt });
}

/**
 * Serializes a session token for storage.
 */
function serializeSession({ token }: Pick<Session, "token">): string {
	return JSON.stringify({
		...token,
		nonce: ethers.encodeBase58(token.nonce),
		issuedAt: token.issuedAt.toISOString(),
	});
}

/**
 * Deserializes an encoded session token.
 */
async function deserializeSession(encoded: string): Promise<Session> {
	const json = JSON.parse(encoded);
	const token = sessionTokenSchema.parse(json);
	return deriveSession(token);
}

async function deriveSession(token: SessionToken): Promise<Session> {
	const encryption = await deriveEncryptionKeyPair(token);
	const relayer = deriveRelayerWallet(token);
	const registration = {
		context: encodeContext({ ...token, relayer: relayer.address }),
		publicKey: await exportPublicKey(encryption),
	};
	return { token, encryption, relayer, registration };
}

function deriveSeed(signature: SignatureLike): Hex {
	// We get the EIP-2098 representation of the signature to ensure that we
	// don't have any reproducibility issues related to different signer
	// implementation using high or low `s` values, giving us a canonical
	// signature representation.
	const { r, yParityAndS } = Signature.from(signature);
	return ethers.solidityPackedKeccak256(
		["bytes32", "bytes32"],
		[r, yParityAndS],
	);
}

function deriveSecret(
	domain: number,
	{ seed }: Pick<SessionToken, "seed">,
): Hex {
	return ethers.solidityPackedKeccak256(["uint8", "bytes32"], [domain, seed]);
}

async function deriveEncryptionKeyPair(
	token: Pick<SessionToken, "seed">,
): Promise<CryptoKeyPair> {
	const secret = deriveSecret(0, token);
	return await importKeyPair(secret);
}

function deriveRelayerWallet(token: Pick<SessionToken, "seed">): Wallet {
	const secret = deriveSecret(1, token);
	return new Wallet(secret);
}

function encodeContext({
	nonce,
	issuedAt,
	relayer,
}: SessionSalt & { relayer: Address }): Hex {
	const issuedAtTimestamp = issuedAt.getTime();
	if (issuedAtTimestamp % 1000 !== 0) {
		// This should _never_ happen because of our Zod schema, but add the
		// extra check to make sure we don't register contexts for sessions that
		// we can't reproduce.
		throw new Error(
			"issuance timestamps with millisecond precision not supported",
		);
	}
	return ethers.solidityPacked(
		["bytes6", "uint48", "address"],
		[nonce, issuedAtTimestamp / 1000, relayer],
	);
}

function decodeSalt(context: Hex): SessionSalt {
	if (ethers.dataLength(context) !== 32) {
		throw new Error(`invalid encoded context ${context}`);
	}
	return {
		nonce: ethers.dataSlice(context, 0, 6),
		issuedAt: new Date(1000 * Number(ethers.dataSlice(context, 6, 12))),
	};
}

function newSalt(): SessionSalt {
	return {
		nonce: ethers.hexlify(ethers.randomBytes(6)),
		issuedAt: new Date(1000 * Math.floor(Date.now() / 1000)),
	};
}

export type { Session, SessionToken };
export { signinToSession, serializeSession, deserializeSession };
