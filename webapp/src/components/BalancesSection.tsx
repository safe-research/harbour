import { useState, useEffect, useCallback, useMemo } from "react";
import { ethers, type JsonRpcApiProvider } from "ethers";
import { Trash2 } from "lucide-react";

import { getERC20TokenAddresses, addERC20TokenAddress, removeERC20TokenAddress } from "@/lib/localStorage";
import { fetchERC20TokenDetails, type ERC20TokenDetails } from "@/lib/erc20";
import { getNativeCurrencySymbolByChainId } from "@/lib/chains";

interface BalancesSectionProps {
	provider: JsonRpcApiProvider;
	safeAddress: string;
	chainId: number;
}

export default function BalancesSection({ provider, safeAddress, chainId }: BalancesSectionProps) {
	const [nativeBalance, setNativeBalance] = useState<string | null>(null);
	const nativeSymbol = useMemo(() => getNativeCurrencySymbolByChainId(chainId), [chainId]);
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
			} catch (err) {
				console.error("Failed to fetch native balance:", err);
				setErrorNativeBalance("Failed to fetch native balance.");
				setNativeBalance(null);
			} finally {
				setIsLoadingNativeBalance(false);
			}
		};
		fetchNativeBalance();
	}, [provider, safeAddress]);

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
			const tokenDetailsPromises = storedAddresses.map((addr) => fetchERC20TokenDetails(provider, addr, safeAddress));
			const results = await Promise.allSettled(tokenDetailsPromises);
			const fetchedTokens: ERC20TokenDetails[] = [];
			for (const result of results) {
				if (result.status === "fulfilled" && result.value) {
					fetchedTokens.push(result.value);
				} else if (result.status === "rejected") {
					console.error("Failed to fetch token details:", result.reason);
				}
			}
			setErc20Tokens(fetchedTokens);
			if (fetchedTokens.length !== storedAddresses.length) {
				setErrorTokens(
					"Some ERC20 token details could not be fetched. They may have been removed or the contract address is invalid.",
				);
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
		if (erc20Tokens.find((token) => token.address.toLowerCase() === newTokenAddress.toLowerCase())) {
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
				setErc20Tokens((prev) => [...prev, details]);
				setNewTokenAddress("");
			} else {
				setErrorTokens(
					`Token details not found for ${newTokenAddress}. Ensure it's a valid ERC20 token on this network.`,
				);
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
		setErc20Tokens((prev) => prev.filter((token) => token.address !== tokenAddress));
	};

	return (
		<div className="mt-10">
			<h2 className="text-xl font-semibold text-gray-900 mb-4">Token Balances</h2>
			<div className="bg-white p-6 border border-gray-200 rounded-lg space-y-6">
				{/* Native Balance */}
				<div>
					<h3 className="text-lg font-medium text-gray-800">Native Token</h3>
					{isLoadingNativeBalance && <p className="text-sm text-gray-500">Loading native balance...</p>}
					{errorNativeBalance && <p className="text-sm text-red-500">{errorNativeBalance}</p>}
					{nativeBalance !== null && !isLoadingNativeBalance && !errorNativeBalance && (
						<p className="text-lg text-gray-700">
							{nativeBalance} {nativeSymbol}
						</p>
					)}
				</div>

				<hr className="border-gray-200" />

				{/* ERC20 Tokens */}
				<div>
					<h3 className="text-lg font-medium text-gray-800 mb-2">ERC20 Tokens</h3>
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
							type="button"
							onClick={handleAddToken}
							disabled={isAddingToken || !newTokenAddress}
							className="px-4 py-2 bg-blue-600 text-white rounded-md shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 sm:text-sm"
						>
							{isAddingToken ? "Adding..." : "Add Token"}
						</button>
					</div>

					{isLoadingTokens && <p className="text-sm text-gray-500">Loading tokens...</p>}
					{errorTokens && !isLoadingTokens && <p className="text-sm text-red-500">{errorTokens}</p>}
					{!isLoadingTokens && erc20Tokens.length === 0 && !errorTokens && (
						<p className="text-sm text-gray-500">No ERC20 tokens added yet.</p>
					)}

					{erc20Tokens.length > 0 && (
						<ul className="space-y-3">
							{erc20Tokens.map((token) => (
								<li
									key={token.address}
									className="p-3 bg-gray-50 border border-gray-200 rounded-md flex justify-between items-center hover:bg-gray-100 transition-colors"
								>
									<div>
										<p className="font-semibold text-gray-800">
											{token.name} ({token.symbol})
										</p>
										<p className="text-sm text-gray-600">{ethers.formatUnits(token.balance, token.decimals)}</p>
									</div>
									<button
										type="button"
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
	);
}
