import { switchToChain } from "@/lib/chains";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { type BrowserProvider, ethers, isAddress } from "ethers";
import type { JsonRpcApiProvider } from "ethers";
import { useEffect, useState } from "react";
import { z } from "zod";
import { BackToDashboardButton } from "../components/BackButton";
import { RequireWallet, useWalletProvider } from "../components/RequireWallet";
import { useChainlistRpcProvider } from "../hooks/useChainlistRpcProvider";
import { useSafeConfiguration } from "../hooks/useSafeConfiguration";
import { HARBOUR_CHAIN_ID, enqueueSafeTransaction } from "../lib/harbour";
import { signSafeTransaction } from "../lib/safe";
import type { ChainId, FullSafeTransaction } from "../lib/types";
import { chainIdSchema, safeAddressSchema } from "../lib/validators";

interface EnqueueContentProps {
	/** The Ethers BrowserProvider from the connected wallet. */
	browserProvider: BrowserProvider;
	/** The Ethers JsonRpcApiProvider for the Safe's chain. */
	rpcProvider: JsonRpcApiProvider;
	/** The address of the Safe contract. */
	safeAddress: string;
	/** The chain ID of the Safe contract. */
	chainId: ChainId;
}

/**
 * Content component for the enqueue transaction page.
 * Handles form input, transaction signing, and submission to Harbour.
 * @param {EnqueueContentProps} props - The component props.
 */
function EnqueueContent({ browserProvider, rpcProvider, safeAddress, chainId }: EnqueueContentProps) {
	const {
		data: configResult,
		isLoading: isLoadingConfig,
		error: configError,
	} = useSafeConfiguration(rpcProvider, safeAddress);
	const navigate = useNavigate();

	const [to, setTo] = useState("");
	const [value, setValue] = useState("");
	const [dataInput, setDataInput] = useState("");
	const [nonce, setNonce] = useState("");

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [txHash, setTxHash] = useState<string>();
	const [error, setError] = useState<string>();

	const isToValid = to === "" ? false : isAddress(to);
	const isValueValid = value === "" || !Number.isNaN(Number(value));
	const isNonceValid = nonce === "" || !Number.isNaN(Number(nonce));

	useEffect(() => {
		if (configResult) {
			setNonce(configResult.nonce.toString());
		}
	}, [configResult]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(undefined);

		try {
			setIsSubmitting(true);
			const txNonce = nonce !== "" ? BigInt(nonce) : (configResult?.nonce ?? BigInt(0));

			const transaction: FullSafeTransaction = {
				to,
				value: value || "0",
				data: dataInput,
				nonce: txNonce.toString(),
				safeAddress,
				chainId,
				operation: 0,
				safeTxGas: "0",
				baseGas: "0",
				gasPrice: "0",
				gasToken: ethers.ZeroAddress,
				refundReceiver: ethers.ZeroAddress,
			};

			await switchToChain(
				{ request: async ({ params, method }) => await browserProvider.send(method, params || []) },
				chainId,
			);
			const signer = await browserProvider.getSigner();
			const signature = await signSafeTransaction(signer, transaction);

			await switchToChain(
				{ request: async ({ params, method }) => await browserProvider.send(method, params || []) },
				HARBOUR_CHAIN_ID,
			);
			const receipt = await enqueueSafeTransaction(signer, transaction, signature);

			setTxHash(receipt.transactionHash);
			// Redirect to queue page after successful enqueue
			navigate({ to: "/queue", search: { safe: safeAddress, chainId } });
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : "Transaction failed";
			setError(message);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="min-h-screen bg-gray-50">
			<div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
				<div className="mb-8">
					<BackToDashboardButton safeAddress={safeAddress} chainId={chainId} />
					<h1 className="text-3xl font-bold text-gray-900 mt-4">Enqueue Transaction</h1>
					<p className="text-gray-700 mt-2">
						Safe: <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">{safeAddress}</span>
					</p>
				</div>

				{configError && (
					<div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
						<p className="text-red-700">Error: {configError.message}</p>
					</div>
				)}

				{isLoadingConfig ? (
					<div className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
						<div className="animate-pulse space-y-4">
							<div className="h-4 bg-gray-200 rounded w-1/4" />
							<div className="h-10 bg-gray-200 rounded w-3/4" />
						</div>
					</div>
				) : (
					!configError && (
						<div className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
							<form onSubmit={handleSubmit} className="space-y-6">
								<div>
									<label htmlFor="to" className="block text-sm font-medium text-gray-700 mb-1">
										To Address
									</label>
									<input
										id="to"
										type="text"
										value={to}
										onChange={(e) => setTo(e.target.value)}
										placeholder="0x..."
										className="mt-1 block w-full border border-gray-300 bg-white text-gray-900 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900"
									/>
									{!isToValid && to !== "" && (
										<p className="mt-1 text-sm text-red-600">Please enter a valid Ethereum address</p>
									)}
								</div>

								<div>
									<label htmlFor="value" className="block text-sm font-medium text-gray-700 mb-1">
										Value (ETH)
									</label>
									<input
										id="value"
										type="text"
										value={value}
										onChange={(e) => setValue(e.target.value)}
										placeholder="0.0"
										className="mt-1 block w-full border border-gray-300 bg-white text-gray-900 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900"
									/>
									{!isValueValid && value !== "" && (
										<p className="mt-1 text-sm text-red-600">Please enter a valid number</p>
									)}
								</div>

								<div>
									<label htmlFor="data" className="block text-sm font-medium text-gray-700 mb-1">
										Data (0x...)
									</label>
									<input
										id="data"
										type="text"
										value={dataInput}
										onChange={(e) => setDataInput(e.target.value)}
										placeholder="0x..."
										className="mt-1 block w-full border border-gray-300 bg-white text-gray-900 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900 font-mono text-sm"
									/>
								</div>

								<div>
									<label htmlFor="nonce" className="block text-sm font-medium text-gray-700 mb-1">
										Nonce
									</label>
									<input
										id="nonce"
										type="number"
										value={nonce}
										onChange={(e) => setNonce(e.target.value)}
										className="mt-1 block w-full border border-gray-300 bg-white text-gray-900 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900"
									/>
									<p className="mt-1 text-sm text-gray-500">
										Current nonce: <span className="font-medium">{configResult?.nonce.toString()}</span> - Leave blank
										to use current nonce
									</p>
									{!isNonceValid && nonce !== "" && (
										<p className="mt-1 text-sm text-red-600">Please enter a valid nonce</p>
									)}
								</div>

								<div className="pt-4">
									<button
										type="submit"
										disabled={isSubmitting || !isToValid || !isValueValid || !isNonceValid}
										className="w-full flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
									>
										{isSubmitting ? (
											<>
												<svg
													className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
													xmlns="http://www.w3.org/2000/svg"
													fill="none"
													viewBox="0 0 24 24"
												>
													<title>Processing...</title>
													<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
													<path
														className="opacity-75"
														fill="currentColor"
														d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
													/>
												</svg>
												Processing...
											</>
										) : (
											<>
												<svg
													className="w-5 h-5 mr-2"
													fill="none"
													stroke="currentColor"
													viewBox="0 0 24 24"
													xmlns="http://www.w3.org/2000/svg"
												>
													<title>Sign & Enqueue Transaction</title>
													<path
														strokeLinecap="round"
														strokeLinejoin="round"
														strokeWidth={2}
														d="M12 6v6m0 0v6m0-6h6m-6 0H6"
													/>
												</svg>
												Sign & Enqueue Transaction
											</>
										)}
									</button>
								</div>

								{txHash && (
									<div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-md">
										<h3 className="text-sm font-medium text-green-800">Transaction Submitted</h3>
										<p className="mt-1 text-sm text-green-700">
											Transaction Hash: <span className="font-mono break-all">{txHash}</span>
										</p>
									</div>
								)}

								{error && (
									<div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-md">
										<h3 className="text-sm font-medium text-red-800">Error</h3>
										<p className="mt-1 text-sm text-red-700">{error}</p>
									</div>
								)}
							</form>
						</div>
					)
				)}
			</div>
		</div>
	);
}

/**
 * Zod schema for validating search parameters for the enqueue route.
 */
const configSearchSchema = z.object({
	safe: safeAddressSchema,
	chainId: chainIdSchema,
});

/**
 * Route definition for the enqueue transaction page.
 * Validates search parameters (safe address, chainId).
 */
export const Route = createFileRoute("/enqueue")({
	validateSearch: zodValidator(configSearchSchema),
	component: EnqueuePage,
});

/**
 * Page component for enqueueing a new Safe transaction.
 * Retrieves validated search params and wraps content with wallet and provider requirements.
 * @returns JSX element for the enqueue page.
 */
export function EnqueuePage() {
	const { safe: safeAddress, chainId } = Route.useSearch();
	return (
		<RequireWallet>
			<EnqueuePageInner safeAddress={safeAddress} chainId={Number(chainId)} />
		</RequireWallet>
	);
}

/**
 * Inner component for the enqueue page, rendered if wallet and providers are ready.
 * @param {{ safeAddress: string; chainId: ChainId }} props - Props containing Safe address and chain ID.
 * @returns JSX element for the enqueue form or loading/error states.
 */
function EnqueuePageInner({ safeAddress, chainId }: { safeAddress: string; chainId: number }) {
	const browserProvider = useWalletProvider();
	const { provider: rpcProvider, error: rpcError, isLoading: isLoadingRpc } = useChainlistRpcProvider(chainId);

	if (rpcError) {
		return <p className="text-center p-6 text-red-600">Error initializing RPC provider: {rpcError.message}</p>;
	}
	if (isLoadingRpc || !rpcProvider) {
		return <p className="text-center p-6 text-gray-600">Initializing provider…</p>;
	}

	return (
		<EnqueueContent
			browserProvider={browserProvider}
			rpcProvider={rpcProvider}
			safeAddress={safeAddress}
			chainId={chainId}
		/>
	);
}
