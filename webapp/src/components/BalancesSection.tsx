import { type JsonRpcApiProvider, ethers } from "ethers";
import { Trash2 } from "lucide-react";
import { useMemo, useState } from "react";

import { useERC20Tokens } from "@/hooks/useERC20Tokens";
import { useNativeBalance } from "@/hooks/useNativeBalance";
import { getNativeCurrencyByChainId } from "@/lib/chains";
import { type ERC20TokenDetails, fetchERC20TokenDetails } from "@/lib/erc20";
import { ethereumAddressSchema } from "@/lib/validators";
import { SendButton } from "./SendButton";

interface BalancesSectionProps {
	provider: JsonRpcApiProvider;
	safeAddress: string;
	chainId: number;
	onSendNative: () => void;
	onSendToken: (tokenAddress: string) => void;
}

export function BalancesSection({ provider, safeAddress, chainId, onSendNative, onSendToken }: BalancesSectionProps) {
	const nativeCurrency = useMemo(() => getNativeCurrencyByChainId(chainId), [chainId]);
	const {
		data: nativeBalance,
		isLoading: isLoadingNativeBalance,
		error: errorNativeBalance,
	} = useNativeBalance(provider, safeAddress, chainId);

	const [newTokenAddress, setNewTokenAddress] = useState<string>("");
	const [addError, setAddError] = useState<string | null>(null);
	const [isAddingToken, setIsAddingToken] = useState<boolean>(false);
	const {
		tokens: erc20Tokens,
		isLoading: isLoadingTokens,
		error: fetchError,
		addAddress: addTokenAddress,
		removeAddress: removeTokenAddress,
	} = useERC20Tokens(provider, safeAddress, chainId);

	const handleAddToken = async () => {
		const validationResult = ethereumAddressSchema.safeParse(newTokenAddress);
		if (!validationResult.success) {
			setAddError("Invalid ERC20 token address format.");
			return;
		}

		if (erc20Tokens.find((token: ERC20TokenDetails) => token.address.toLowerCase() === newTokenAddress.toLowerCase())) {
			setAddError("Token already added.");
			setNewTokenAddress("");
			return;
		}

		setIsAddingToken(true);
		setAddError(null);
		try {
			const details = await fetchERC20TokenDetails(provider, newTokenAddress, safeAddress);
			if (details) {
				addTokenAddress(newTokenAddress);
				setNewTokenAddress("");
			} else {
				setAddError(`Token details not found for ${newTokenAddress}. Ensure it's a valid ERC20 token on this network.`);
			}
		} catch (err) {
			console.error("Failed to add token:", err);
			setAddError("Failed to add token. Please check the address and network.");
		} finally {
			setIsAddingToken(false);
		}
	};

	const handleRemoveToken = (tokenAddress: string) => {
		removeTokenAddress(tokenAddress);
	};

	const handleSendNative = () => {
		onSendNative();
	};

	const handleSendToken = (tokenAddress: string) => {
		onSendToken(tokenAddress);
	};

	return (
		<div className="mt-10">
			<h2 className="text-xl font-semibold text-gray-900 mb-4">Token Balances</h2>
			<div className="bg-white p-6 border border-gray-200 rounded-lg space-y-6">
				{/* Native Balance */}
				<div>
					<div className="flex justify-between items-center mb-2">
						<h3 className="text-lg font-medium text-gray-800">Native Token</h3>
						{nativeBalance !== undefined && !isLoadingNativeBalance && !errorNativeBalance && (
							<SendButton onClick={handleSendNative} disabled={nativeBalance === 0n} />
						)}
					</div>
					{isLoadingNativeBalance && <p className="text-sm text-gray-500">Loading native balance...</p>}
					{errorNativeBalance && <p className="text-sm text-red-500">{errorNativeBalance.message}</p>}
					{nativeBalance !== undefined && !isLoadingNativeBalance && !errorNativeBalance && (
						<p className="text-lg text-gray-700">
							{ethers.formatUnits(nativeBalance, nativeCurrency.decimals)} {nativeCurrency.symbol}
						</p>
					)}
				</div>

				<hr className="border-gray-200" />

				{/* ERC20 Tokens */}
				<div>
					<h3 className="text-lg font-medium text-gray-800 mb-2">ERC20 Tokens</h3>
					<div className="flex items-center space-x-4 mb-4">
						<input
							type="text"
							value={newTokenAddress}
							onChange={(e) => setNewTokenAddress(e.target.value)}
							placeholder="Enter ERC20 token address (0x...)"
							className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 flex-1 max-w-md sm:text-sm"
							disabled={isAddingToken}
						/>
						<button
							type="button"
							onClick={handleAddToken}
							disabled={isAddingToken || !newTokenAddress}
							className="px-4 py-2 bg-black text-white rounded-md shadow-sm hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 sm:text-sm flex-shrink-0"
						>
							{isAddingToken ? "Adding..." : "Add Token"}
						</button>
					</div>

					{addError && <p className="text-sm text-red-500">{addError}</p>}
					{isLoadingTokens && <p className="text-sm text-gray-500">Loading tokens...</p>}
					{fetchError && !isLoadingTokens && <p className="text-sm text-red-500">{fetchError}</p>}
					{!isLoadingTokens && erc20Tokens.length === 0 && !fetchError && (
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
									<div className="flex items-center space-x-2">
										<SendButton onClick={() => handleSendToken(token.address)} disabled={token.balance === 0n} />
										<button
											type="button"
											onClick={() => handleRemoveToken(token.address)}
											className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-100 rounded-full focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-1"
											aria-label={`Remove ${token.name} token`}
										>
											<Trash2 size={18} />
										</button>
									</div>
								</li>
							))}
						</ul>
					)}
				</div>
			</div>
		</div>
	);
}
