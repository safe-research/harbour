import type { JsonRpcApiProvider } from "ethers";
import Fuse from "fuse.js";
import { shuffle } from "./arrays";
import chainsJson from "./chains.json" with { type: "json" };
import { getEIP1193ProviderFromRPCProvider } from "./providers";
import type { ChainId } from "./types";

/** Type representing the standard for Etherscan-like explorers. */
type EtherscanExplorerStandard = "EIP3091";

/**
 * Interface for entries in the chains.json file.
 * Describes the structure of chain configuration data.
 */
interface ChainsJsonEntry {
	name: string;
	chain: string;
	chainId: number;
	shortName: string;
	nativeCurrency: {
		name: string;
		symbol: string;
		decimals: number;
	};
	infoURL: string;
	/**
	 * List of explorers for the chain.
	 * The "& {}" is a workaround for string literal type autocomplete.
	 */
	explorers: {
		name: string;
		url: string;
		standard: EtherscanExplorerStandard | (string & {});
	}[];
	/** List of RPC endpoints for the chain. */
	rpc: { url: string }[];
}

/**
 * Interface for chain search results
 */
export interface ChainSearchResult {
	chainId: number;
	name: string;
	displayName: string; // "Chain Name (Chain ID)"
}

/**
 * Interface for parameters used with the `wallet_addEthereumChain` RPC method.
 */
interface WalletAddEthereumChainParams {
	chainId: string; // Hexadecimal string
	chainName: string;
	nativeCurrency: {
		name: string;
		symbol: string;
		decimals: number;
	};
	rpcUrls: string[];
	blockExplorerUrls: string[];
}

const keys: (keyof ChainsJsonEntry)[] = ["name", "chain", "shortName"];
const chainsFuse = new Fuse(chainsJson as ChainsJsonEntry[], {
	keys,
	threshold: 0.4, // Lower threshold for more strict matching
	includeScore: true,
	includeMatches: true,
	ignoreLocation: true,
	minMatchCharLength: 2,
});

/**
 * Retrieves the chain data for a given chain ID.
 *
 * Looks up the specified `chainId` in `chains.json` and returns the corresponding entry.
 *
 * @param chainId - The numeric chain ID to look up.
 * @returns The `ChainsJsonEntry` matching the provided chain ID.
 * @throws {Error} When no chain with the given ID exists in `chains.json`.
 */
function getChainDataByChainId(chainId: number): ChainsJsonEntry {
	const entry = (chainsJson as ChainsJsonEntry[]).find(
		(e) => e.chainId === chainId,
	);
	if (!entry) {
		throw new Error(`no chain with id ${chainId} in chains.json`);
	}

	return entry;
}

/**
 * Maps chain data to the parameters required by `wallet_addEthereumChain`.
 *
 * Constructs the `WalletAddEthereumChainParams` object from a `ChainsJsonEntry`.
 *
 * @param entry - The chain data entry retrieved from `chains.json`.
 * @returns The parameters for adding the chain to a wallet provider.
 */
function mapChainDataToWalletAddEthereumChainParams(
	entry: ChainsJsonEntry,
): WalletAddEthereumChainParams {
	return {
		chainId: `0x${entry.chainId.toString(16)}`,
		chainName: entry.name,
		nativeCurrency: {
			name: entry.nativeCurrency.name,
			symbol: entry.nativeCurrency.symbol,
			decimals: entry.nativeCurrency.decimals,
		},
		rpcUrls: entry.rpc.map((rpc) => rpc.url),
		blockExplorerUrls: entry.explorers.map((explorer) => explorer.url),
	};
}

/**
 * Retrieves an RPC endpoint URL for a given Ethereum-style chain ID.
 *
 * Looks up the `chainId` in `chains.json`, throws if not found or if no URLs are configured.
 * If `verify` is `true` (default), it will send an `eth_chainId` JSON-RPC call to each URL
 * until one responds with the expected chain ID, to avoid returning dead endpoints.
 *
 * @param chainId - The numeric chain ID to look up in the RPC list.
 * @param verify - Whether to verify the endpoint by sending an `eth_chainId` request (default: true).
 * @returns A Promise that resolves to the first valid RPC URL for the chain.
 * @throws {Error} When the `chainId` is not present, no URLs configured, or none respond correctly.
 */
async function getRpcUrlByChainId(
	chainId: number,
	verify = true,
): Promise<string> {
	const entry = getChainDataByChainId(chainId);
	if (!entry.rpc || entry.rpc.length === 0) {
		throw new Error(`no rpc URLs configured for chain ${chainId}`);
	}

	const httpRpcs = entry.rpc.filter((rpc) => rpc.url.startsWith("http"));
	if (httpRpcs.length === 0) {
		throw new Error(`no http rpc URLs configured for chain ${chainId}`);
	}
	// shuffle the rpcs so we don't overload the same RPCs
	const rpcs = shuffle(httpRpcs);
	if (!verify) {
		return rpcs[0].url;
	}

	while (rpcs.length) {
		const rpc = rpcs.shift() as { url: string };
		try {
			const res = (await Promise.race([
				fetch(rpc.url, {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						jsonrpc: "2.0",
						id: 1,
						method: "eth_chainId",
						params: [],
					}),
				}),
				new Promise((_, rej) =>
					setTimeout(() => rej(new Error("timeout")), 3000),
				),
			])) as Response;

			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const j = await res.json();
			// result is hex string, e.g. '0x1'
			if (Number.parseInt(j.result, 16) === chainId) {
				return rpc.url;
			}
		} catch {
			// try next URL
		}
	}

	throw new Error(`no valid rpc URL responded for chain ${chainId}`);
}

/**
 * Retrieves the native currency detials for a given chain ID.
 *
 * Looks up the `chainId` in `chains.json` and returns the corresponding native currency details.
 * If no details are found, defaults to Ether values.
 *
 * @param chainId - The numeric chain ID to look up in the native currency details list.
 * @returns The native currency details for the chain, or the Ether details if not found.
 */
function getNativeCurrencyByChainId(
	chainId: number,
): ChainsJsonEntry["nativeCurrency"] {
	const entry = getChainDataByChainId(chainId);
	return (
		entry?.nativeCurrency || {
			name: "Ether",
			symbol: "ETH",
			decimals: 18,
		}
	);
}

/**
 * Switches the connected wallet to the specified chain and adds it if missing.
 *
 * Attempts to switch the active network using `wallet_switchEthereumChain`. If the chain
 * is not added (error code 4902), it uses `wallet_addEthereumChain` with parameters from
 * the local `chains.json` configuration.
 *
 * @param provider - Ethers BrowserProvider instance to interact with the wallet.
 * @param chainId - The chain identifier to switch to, in hex string format (e.g., '0x1').
 * @returns A Promise that resolves once the network switch or addition completes.
 * @throws Will rethrow the original error if switching fails for reasons other than
 *        a missing chain (error code 4902).
 */
async function switchToChain(
	provider: JsonRpcApiProvider,
	chainId: ChainId,
): Promise<void> {
	const eip1193Provider = getEIP1193ProviderFromRPCProvider(provider);

	try {
		await eip1193Provider.request({
			method: "wallet_switchEthereumChain",
			params: [{ chainId: `0x${chainId.toString(16)}` }],
		});
	} catch (error: unknown) {
		const chainData = mapChainDataToWalletAddEthereumChainParams(
			getChainDataByChainId(chainId),
		);
		if ((error as { code?: number }).code === 4902) {
			await eip1193Provider.request({
				method: "wallet_addEthereumChain",
				params: [chainData],
			});
		} else {
			console.error("Failed to switch network:", error);
			throw error;
		}
	}
}

/**
 * Performs fuzzy search on chain names using Fuse.js
 *
 * @param query - The search string to match against chain names
 * @param maxResults - Maximum number of results to return (default: 10)
 * @returns Array of matching chains with their display names
 */
export function searchChainsByName(
	query: string,
	maxResults = 10,
): ChainSearchResult[] {
	if (!query.trim()) {
		return [];
	}

	const results = chainsFuse.search(query, { limit: maxResults });

	return results.map(({ item }) => ({
		chainId: item.chainId,
		name: item.name,
		displayName: `${item.name} (${item.chainId})`,
	}));
}

/**
 * Finds a chain by exact chain ID
 */
export function getChainById(chainId: number): ChainSearchResult | null {
	const chains = chainsJson as ChainsJsonEntry[];
	const chain = chains.find((c) => c.chainId === chainId);

	if (!chain) {
		return null;
	}

	return {
		chainId: chain.chainId,
		name: chain.name,
		displayName: `${chain.name} (${chain.chainId})`,
	};
}

/**
 * Converts a chain ID or name input to a numeric chain ID
 *
 * @param input - Either a numeric chain ID string or a chain name
 * @returns The numeric chain ID, or null if not found
 */
export function resolveChainIdFromInput(input: string): number | null {
	const trimmedInput = input.trim();
	const chains = chainsJson as ChainsJsonEntry[];

	// If it's a numeric chain ID, parse and validate
	if (/^\d+$/.test(trimmedInput)) {
		const chainId = Number.parseInt(trimmedInput, 10);
		const exists = chains.some((chain) => chain.chainId === chainId);
		return exists ? chainId : null;
	}

	// Otherwise, search by name
	const normalizedInput = trimmedInput.toLowerCase();
	const matchingChain = chains.find(
		(chain) => chain.name.toLowerCase() === normalizedInput,
	);

	return matchingChain ? matchingChain.chainId : null;
}

export { getRpcUrlByChainId, switchToChain, getNativeCurrencyByChainId };
