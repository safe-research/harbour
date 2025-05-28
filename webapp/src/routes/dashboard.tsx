import { BackButton } from "@/components/BackButton";
import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { ethers, type JsonRpcApiProvider } from "ethers"; // Added ethers
import { PlusCircle, ScrollText, Trash2 } from "lucide-react"; // Added Trash2
import { useState, useEffect, useCallback } from "react"; // Added React hooks

import ActionCard from "../components/ActionCard";
import { RequireWallet } from "../components/RequireWallet";
import SafeConfigDisplay from "../components/SafeConfigDisplay";
import { useChainlistRpcProvider } from "../hooks/useChainlistRpcProvider";
import { useSafeConfiguration } from "../hooks/useSafeConfiguration";

import { getERC20TokenAddresses, addERC20TokenAddress, removeERC20TokenAddress } from "@/lib/localStorage";
import { fetchERC20TokenDetails, type ERC20TokenDetails } from "@/lib/erc20";
// Assuming getChainDataByChainId is exported from chains.ts, or adjust path if needed
// For this example, I will assume it's part of a default export or a named export.
// Let's try to import it directly - if chains.ts has `export function getChainDataByChainId ...`
// then this should work. If not, it might be part of a larger object.
// Based on previous read_file, it's not exported directly.
// For now, let's assume a utility function exists or needs to be added to chains.ts to get the symbol.
// For the sake of this exercise, I will mock it locally if I can't import it.
// Re-checking the previous read_files output for chains.ts: it does NOT export getChainDataByChainId
// It exports getRpcUrlByChainId and switchToChain.
// This means I need to either:
// 1. Modify chains.ts to export getChainDataByChainId (outside scope of current subtask)
// 2. Duplicate minimal logic here (not ideal)
// 3. Use a placeholder or try to get it from another source (e.g. provider.getNetwork())

// For now, I'll use provider.getNetwork() and then try to get the symbol from its name,
// or default to a generic symbol if not found in a simple map.
// A more robust solution would involve enhancing `chains.ts`.

import { configSearchSchema } from "../lib/validators";
import chainsJson from "@/lib/chains.json"; // Direct import for native currency symbol

interface ChainsJsonEntry {
	name: string;
	chain: string;
	chainId: number;
	nativeCurrency: {
		name: string;
		symbol: string;
		decimals: number;
	};
}

function getNativeCurrencySymbolFromStore(chainId: number): string {
	const entry = (chainsJson as ChainsJsonEntry[]).find((e) => e.chainId === chainId);
	return entry?.nativeCurrency?.symbol || "ETH"; // Default to ETH
}


interface DashboardContentProps {
	/** Ethers JSON RPC API provider instance. */
	provider: JsonRpcApiProvider;
	/** The address of the Safe. */
	safeAddress: string;
	/** The chain ID where the Safe is deployed. */
	chainId: number;
}

/**
 * Displays the main content of the Safe dashboard, including actions and configuration.
 * @param {DashboardContentProps} props - The component props.
 * @returns JSX element representing the dashboard content.
 */
function DashboardContent({ provider, safeAddress, chainId }: DashboardContentProps) {
	const { data: config, isLoading: isLoadingConfig, error: errorConfig } = useSafeConfiguration(provider, safeAddress);

	const [nativeBalance, setNativeBalance] = useState<string | null>(null);
	const [nativeSymbol, setNativeSymbol] = useState<string>("ETH");
	const [isLoadingNativeBalance, setIsLoadingNativeBalance] = useState<boolean>(false);
	const [errorNativeBalance, setErrorNativeBalance] = useState<string | null>(null);

	const [erc20Tokens, setErc20Tokens] = useState<ERC20TokenDetails[]>([]);
	const [newTokenAddress, setNewTokenAddress] = useState<string>("");
	const [isLoadingTokens, setIsLoadingTokens] = useState<boolean>(false);
	const [errorTokens, setErrorTokens] = useState<string | null>(null);
	const [isAddingToken, setIsAddingToken] = useState<boolean>(false);


	// Fetch Native Balance
	useEffect(() => {
		const fetchNativeBalance = async () => {
			if (!provider || !safeAddress) return;
			setIsLoadingNativeBalance(true);
			setErrorNativeBalance(null);
			try {
				const balance = await provider.getBalance(safeAddress);
				setNativeBalance(ethers.formatEther(balance));
				// Fetch native currency symbol
				const symbol = getNativeCurrencySymbolFromStore(chainId);
				setNativeSymbol(symbol);
			} catch (err) {
				console.error("Failed to fetch native balance:", err);
				setErrorNativeBalance("Failed to fetch native balance.");
				setNativeBalance(null);
			} finally {
				setIsLoadingNativeBalance(false);
			}
		};
		fetchNativeBalance();
	}, [provider, safeAddress, chainId]);

	// Load and Fetch ERC20 Tokens
	const loadAndFetchERC20Tokens = useCallback(async () => {
		if (!provider || !safeAddress) return;
		setIsLoadingTokens(true);
		setErrorTokens(null);
		try {
			const storedAddresses = getERC20TokenAddresses();
			if (storedAddresses.length === 0) {
				setErc20Tokens([]);
				setIsLoadingTokens(false);
				return;
			}
			const tokenDetailsPromises = storedAddresses.map(addr =>
				fetchERC20TokenDetails(provider, addr, safeAddress)
			);
			const results = await Promise.allSettled(tokenDetailsPromises);
			const fetchedTokens: ERC20TokenDetails[] = [];
			results.forEach(result => {
				if (result.status === 'fulfilled' && result.value) {
					fetchedTokens.push(result.value);
				} else if (result.status === 'rejected') {
					console.error("Failed to fetch token details:", result.reason);
					// Individual token fetch error can be handled here if needed, e.g., by showing partial list
				}
			});
			setErc20Tokens(fetchedTokens);
			if (fetchedTokens.length !== storedAddresses.length) {
                 setErrorTokens("Some ERC20 token details could not be fetched. They may have been removed or the contract address is invalid.");
            }
		} catch (err) {
			console.error("Failed to load or fetch ERC20 tokens:", err);
			setErrorTokens("Failed to load ERC20 tokens.");
			setErc20Tokens([]);
		} finally {
			setIsLoadingTokens(false);
		}
	}, [provider, safeAddress]);

	useEffect(() => {
		loadAndFetchERC20Tokens();
	}, [loadAndFetchERC20Tokens]);


	const handleAddToken = async () => {
		if (!provider || !safeAddress) {
			setErrorTokens("Provider or Safe address not available.");
			return;
		}
		if (!newTokenAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
			setErrorTokens("Invalid ERC20 token address format.");
			return;
		}
		if (erc20Tokens.find(token => token.address.toLowerCase() === newTokenAddress.toLowerCase())) {
			setErrorTokens("Token already added.");
			setNewTokenAddress("");
			return;
		}

		setIsAddingToken(true);
		setErrorTokens(null);
		try {
			const details = await fetchERC20TokenDetails(provider, newTokenAddress, safeAddress);
			if (details) {
				addERC20TokenAddress(newTokenAddress);
				setErc20Tokens(prevTokens => [...prevTokens, details]);
				setNewTokenAddress("");
			} else {
				setErrorTokens(`Token details not found for ${newTokenAddress}. Ensure it's a valid ERC20 token on this network.`);
			}
		} catch (err) {
			console.error("Failed to add token:", err);
			setErrorTokens("Failed to add token. Please check the address and network.");
		} finally {
			setIsAddingToken(false);
		}
	};

	const handleRemoveToken = (tokenAddress: string) => {
		removeERC20TokenAddress(tokenAddress);
		setErc20Tokens(prevTokens => prevTokens.filter(token => token.address !== tokenAddress));
	};


	return (
		<div className="min-h-screen bg-gray-50">
			<div className="max-w-5xl mx-auto p-6 space-y-8">
				<div>
					<BackButton to="/">Back to home</BackButton>
					<h1 className="text-3xl font-bold text-gray-900">Safe Dashboard</h1>
					<p className="text-gray-600">Manage your Safe and execute transactions</p>
				</div>

				{isLoadingConfig && <p className="text-gray-600">Loading configuration…</p>}
				{errorConfig && <p className="text-red-600">Error: {errorConfig.message}</p>}

				{config && (
					<>
						<div className="grid md:grid-cols-2 gap-6">
							<ActionCard
								title="Transaction Queue"
								description="View and execute pending transactions that are ready to be executed."
								icon={ScrollText}
								ctaText="View Queue"
								to="/queue"
								search={{ safe: safeAddress, chainId }}
							/>
							<ActionCard
								title="New Transaction"
								description="Create and enqueue a new transaction for your Safe."
								icon={PlusCircle}
								ctaText="Create Transaction"
								to="/enqueue"
								search={{ safe: safeAddress, chainId }}
							/>
						</div>

						<div className="mt-10">
							<h2 className="text-xl font-semibold text-gray-900 mb-4">Safe Configuration</h2>
							<div className="bg-white p-6 border border-gray-200 rounded-lg">
								<SafeConfigDisplay config={config} />
							</div>
						</div>

						{/* Balances Section */}
						<div className="mt-10">
							<h2 className="text-xl font-semibold text-gray-900 mb-4">Token Balances</h2>
							<div className="bg-white p-6 border border-gray-200 rounded-lg space-y-6">
								{/* Native Balance */}
								<div>
									<h3 className="text-lg font-medium text-gray-800">Native Token</h3>
									{isLoadingNativeBalance && <p className="text-sm text-gray-500">Loading native balance...</p>}
									{errorNativeBalance && <p className="text-sm text-red-500">{errorNativeBalance}</p>}
									{nativeBalance !== null && !isLoadingNativeBalance && !errorNativeBalance && (
										<p className="text-lg text-gray-700">{nativeBalance} {nativeSymbol}</p>
									)}
								</div>

								<hr className="border-gray-200" />

								{/* ERC20 Tokens */}
								<div>
									<h3 className="text-lg font-medium text-gray-800 mb-2">ERC20 Tokens</h3>
									{/* Add Token Form */}
									<div className="flex items-center space-x-2 mb-4">
										<input
											type="text"
											value={newTokenAddress}
											onChange={(e) => setNewTokenAddress(e.target.value)}
											placeholder="Enter ERC20 token address (0x...)"
											className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 w-full sm:text-sm"
											disabled={isAddingToken}
										/>
										<button
											onClick={handleAddToken}
											disabled={isAddingToken || !newTokenAddress}
											className="px-4 py-2 bg-blue-600 text-white rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 sm:text-sm"
										>
											{isAddingToken ? "Adding..." : "Add Token"}
										</button>
									</div>

									{/* Token List */}
									{isLoadingTokens && <p className="text-sm text-gray-500">Loading tokens...</p>}
									{errorTokens && !isLoadingTokens && <p className="text-sm text-red-500">{errorTokens}</p>}
									
									{!isLoadingTokens && erc20Tokens.length === 0 && !errorTokens && (
										<p className="text-sm text-gray-500">No ERC20 tokens added yet.</p>
									)}

									{erc20Tokens.length > 0 && (
										<ul className="space-y-3">
											{erc20Tokens.map(token => (
												<li key={token.address} className="p-3 bg-gray-50 border border-gray-200 rounded-md flex justify-between items-center hover:bg-gray-100 transition-colors">
													<div>
														<p className="font-semibold text-gray-800">{token.name} ({token.symbol})</p>
														<p className="text-sm text-gray-600">{ethers.formatUnits(token.balance, token.decimals)}</p>
													</div>
													<button 
														onClick={() => handleRemoveToken(token.address)} 
														className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-full focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
														aria-label={`Remove ${token.name} token`}
													>
														<Trash2 size={18} />
													</button>
												</li>
											))}
										</ul>
									)}
								</div>
							</div>
						</div>
					</>
				)}
			</div>
		</div>
	);
}

/**
 * Page component for the Safe dashboard.
 * It retrieves validated search parameters (Safe address and chain ID)
 * and wraps the main content with a wallet requirement check.
 * @returns JSX element for the dashboard page.
 */
export const Route = createFileRoute("/dashboard")({
	validateSearch: zodValidator(configSearchSchema),
	component: DashboardPage,
});

/**
 * Page component for the Safe dashboard.
 * It retrieves validated search parameters (Safe address and chain ID)
 * and wraps the main content with a wallet requirement check.
 * @returns JSX element for the dashboard page.
 */
export function DashboardPage() {
	const { safe: safeAddress, chainId } = Route.useSearch();
	return (
		<RequireWallet>
			<DashboardPageInner safeAddress={safeAddress} chainId={chainId} />
		</RequireWallet>
	);
}

/**
 * Inner component for the dashboard page, rendered if a wallet is connected.
 * It acquires a JSON RPC provider for the given chain ID and then renders the main dashboard content.
 * @param {{ safeAddress: string; chainId: number }} props - Props containing the Safe address and chain ID.
 * @returns JSX element, either a loading/error state or the DashboardContent.
 */
function DashboardPageInner({ safeAddress, chainId }: { safeAddress: string; chainId: number }) {
	const { provider, error, isLoading } = useChainlistRpcProvider(chainId);

	if (error) return <p className="text-red-600">Error: {error.message}</p>;
	if (isLoading || !provider) return <p className="text-gray-600">Initializing provider…</p>;
	return <DashboardContent provider={provider} safeAddress={safeAddress} chainId={chainId} />;
}
