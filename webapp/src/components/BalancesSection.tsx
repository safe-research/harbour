import { zodResolver } from "@hookform/resolvers/zod";
import { type JsonRpcApiProvider, ethers } from "ethers";
import { Trash2 } from "lucide-react";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { useERC20Tokens } from "@/hooks/useERC20Tokens";
import { useNativeBalance } from "@/hooks/useNativeBalance";
import { getNativeCurrencyByChainId } from "@/lib/chains";
import { type ERC20TokenDetails, fetchERC20TokenDetails } from "@/lib/erc20";
import { ethereumAddressSchema } from "@/lib/validators";
import { SendButton } from "./SendButton";

const createAddTokenFormSchema = (
	erc20Tokens: ERC20TokenDetails[],
	provider: JsonRpcApiProvider,
	safeAddress: string,
) =>
	z.object({
		tokenAddress: ethereumAddressSchema
			.refine(
				(address) => {
					const tokenExists = erc20Tokens.find(
						(token: ERC20TokenDetails) => token.address.toLowerCase() === address.toLowerCase(),
					);
					return !tokenExists;
				},
				{
					message: "Token already added.",
				},
			)
			.refine(
				async (address) => {
					try {
						const details = await fetchERC20TokenDetails(provider, address, safeAddress);
						return !!details;
					} catch (err) {
						console.error("Token validation failed:", err);
						return false;
					}
				},
				{
					message: "Token details not found. Ensure it's a valid ERC20 token on this network.",
				},
			),
	});

type AddTokenFormData = z.infer<ReturnType<typeof createAddTokenFormSchema>>;

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

	const {
		tokens: erc20Tokens,
		isLoading: isLoadingTokens,
		error: fetchError,
		addAddress: addTokenAddress,
		removeAddress: removeTokenAddress,
	} = useERC20Tokens(provider, safeAddress, chainId);

	// Create schema with all validations consolidated
	const addTokenFormSchema = useMemo(
		() => createAddTokenFormSchema(erc20Tokens, provider, safeAddress),
		[erc20Tokens, provider, safeAddress],
	);

	const {
		register,
		handleSubmit,
		formState: { errors, isValidating },
		reset,
		watch,
	} = useForm<AddTokenFormData>({
		resolver: zodResolver(addTokenFormSchema),
		mode: "onSubmit",
	});

	const tokenAddress = watch("tokenAddress", "");

	const onSubmit = async (data: AddTokenFormData) => {
		addTokenAddress(data.tokenAddress);
		reset();
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
					<form onSubmit={handleSubmit(onSubmit)} className="space-y-2 mb-4">
						<div className="flex items-center space-x-4">
							<input
								{...register("tokenAddress")}
								type="text"
								placeholder="Enter ERC20 token address (0x...)"
								className="p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 flex-1 max-w-md sm:text-sm"
							/>
							<button
								type="submit"
								disabled={!tokenAddress || isValidating}
								className="px-4 py-2 bg-black text-white rounded-md shadow-sm hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 sm:text-sm flex-shrink-0"
							>
								Add Token
							</button>
						</div>
						{errors.tokenAddress && <p className="text-sm text-red-500">{errors.tokenAddress.message}</p>}
					</form>
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
