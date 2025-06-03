import { switchToChain } from "@/lib/chains";
import { ERC20_ABI, fetchERC20TokenDetails } from "@/lib/erc20";
import { HARBOUR_CHAIN_ID, enqueueSafeTransaction } from "@/lib/harbour";
import type { SafeConfiguration } from "@/lib/safe";
import { signSafeTransaction } from "@/lib/safe";
import type { ChainId, FullSafeTransaction } from "@/lib/types";
import { useNavigate } from "@tanstack/react-router";
import type { BrowserProvider, JsonRpcApiProvider } from "ethers";
import { ethers, isAddress } from "ethers";
import React, { useEffect, useState } from "react";

/**
 * Props for the ERC20TransferForm component.
 */
interface ERC20TransferFormProps {
	/** The address of the Safe contract. */
	safeAddress: string;
	/** The chain ID where the Safe contract is deployed. */
	chainId: ChainId;
	/** An Ethers BrowserProvider instance from the connected wallet. */
	browserProvider: BrowserProvider;
	/** An Ethers JsonRpcApiProvider instance for the Safe's chain, used for fetching token details. */
	rpcProvider: JsonRpcApiProvider;
	/** The configuration of the Safe, including the current nonce. */
	config: SafeConfiguration;
}

/**
 * A form component for creating and enqueuing an ERC20 token transfer transaction
 * for a Gnosis Safe. It handles fetching token decimals, input validation,
 * transaction encoding, signing, and submission to the Harbour service.
 */
export function ERC20TransferForm({
	safeAddress,
	chainId,
	browserProvider,
	rpcProvider,
	config,
}: ERC20TransferFormProps) {
	const navigate = useNavigate();

	const [tokenAddress, setTokenAddress] = useState("");
	const [recipient, setRecipient] = useState("");
	const [amount, setAmount] = useState("");
	const [decimals, setDecimals] = useState<number | null>(null);
	const [nonce, setNonce] = useState("");

	const [isFetchingDecimals, setIsFetchingDecimals] = useState(false);
	const [fetchDecimalsError, setFetchDecimalsError] = useState<string>();

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [txHash, setTxHash] = useState<string>();
	const [error, setError] = useState<string>();

	const isTokenAddressValid = tokenAddress === "" || isAddress(tokenAddress);
	const isRecipientValid = recipient === "" || isAddress(recipient);
	const isAmountValid = amount === "" || (!Number.isNaN(Number(amount)) && Number(amount) > 0);
	const isNonceValid = nonce === "" || (!Number.isNaN(Number(nonce)) && Number.isInteger(Number(nonce)) && Number(nonce) >= 0);

	useEffect(() => {
		if (config) {
			setNonce(config.nonce.toString());
		}
	}, [config]);

	useEffect(() => {
		const fetchDecimals = async () => {
			if (isAddress(tokenAddress)) {
				setIsFetchingDecimals(true);
				setFetchDecimalsError(undefined);
				setDecimals(null);
				try {
					const details = await fetchERC20TokenDetails(tokenAddress, rpcProvider);
					setDecimals(details.decimals);
				} catch (err) {
					setDecimals(null);
					setFetchDecimalsError(err instanceof Error ? err.message : "Failed to fetch token details.");
				} finally {
					setIsFetchingDecimals(false);
				}
			} else {
				setDecimals(null);
				setFetchDecimalsError(undefined);
			}
		};
		void fetchDecimals();
	}, [tokenAddress, rpcProvider]);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(undefined);
		setTxHash(undefined);

		if (!isAddress(tokenAddress)) {
			setError("Invalid Token Address.");
			return;
		}
		if (!isAddress(recipient)) {
			setError("Invalid Recipient Address.");
			return;
		}
		if (Number.isNaN(Number(amount)) || Number(amount) <= 0) {
			setError("Invalid Amount. Must be a positive number.");
			return;
		}
		if (decimals === null) {
			setError("Token decimals could not be determined. Please check the token address and network.");
			return;
		}
		const currentNonce = nonce !== "" ? BigInt(nonce) : config.nonce;
		if (Number.isNaN(currentNonce) || BigInt(currentNonce) < 0) {
			setError("Invalid nonce. Must be a non-negative integer.");
			return;
		}

		try {
			setIsSubmitting(true);

			const amountInSmallestUnit = ethers.parseUnits(amount, decimals);
			const erc20Interface = new ethers.Interface(ERC20_ABI);
			const encodedTransferData = erc20Interface.encodeFunctionData("transfer", [
				recipient,
				amountInSmallestUnit,
			]);

			const transaction: FullSafeTransaction = {
				to: tokenAddress,
				value: "0", // Value is 0 for token transfers
				data: encodedTransferData,
				nonce: currentNonce.toString(),
				safeAddress,
				chainId,
				operation: 0, // 0 for CALL
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
			navigate({ to: "/queue", search: { safe: safeAddress, chainId } });
		} catch (err: unknown) {
			const message = err instanceof Error ? err.message : "Transaction failed";
			setError(message);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
			<form onSubmit={handleSubmit} className="space-y-6">
				<div>
					<label htmlFor="tokenAddress" className="block text-sm font-medium text-gray-700 mb-1">
						Token Contract Address
					</label>
					<input
						id="tokenAddress"
						type="text"
						value={tokenAddress}
						onChange={(e) => setTokenAddress(e.target.value)}
						placeholder="0x..."
						className="mt-1 block w-full border border-gray-300 bg-white text-gray-900 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900"
						required
					/>
					{!isTokenAddressValid && tokenAddress !== "" && (
						<p className="mt-1 text-sm text-red-600">Please enter a valid Ethereum address.</p>
					)}
					{isFetchingDecimals && <p className="mt-1 text-sm text-gray-500">Fetching token details...</p>}
					{fetchDecimalsError && <p className="mt-1 text-sm text-red-600">{fetchDecimalsError}</p>}
					{decimals !== null && (
						<p className="mt-1 text-sm text-green-600">Token Decimals: {decimals}</p>
					)}
				</div>

				<div>
					<label htmlFor="recipient" className="block text-sm font-medium text-gray-700 mb-1">
						Recipient Address
					</label>
					<input
						id="recipient"
						type="text"
						value={recipient}
						onChange={(e) => setRecipient(e.target.value)}
						placeholder="0x..."
						className="mt-1 block w-full border border-gray-300 bg-white text-gray-900 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900"
						required
					/>
					{!isRecipientValid && recipient !== "" && (
						<p className="mt-1 text-sm text-red-600">Please enter a valid Ethereum address.</p>
					)}
				</div>

				<div>
					<label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
						Amount (in tokens)
					</label>
					<input
						id="amount"
						type="text"
						value={amount}
						onChange={(e) => setAmount(e.target.value)}
						placeholder="e.g., 100"
						className="mt-1 block w-full border border-gray-300 bg-white text-gray-900 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900"
						required
						disabled={decimals === null && isAddress(tokenAddress)}
					/>
					{!isAmountValid && amount !== "" && (
						<p className="mt-1 text-sm text-red-600">Please enter a valid positive number.</p>
					)}
					{decimals === null && isAddress(tokenAddress) && !isFetchingDecimals && !fetchDecimalsError && (
						<p className="mt-1 text-sm text-yellow-600">Enter a valid token address to enable amount input.</p>
					)}
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
						min="0"
						step="1"
						className="mt-1 block w-full border border-gray-300 bg-white text-gray-900 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900"
					/>
					<p className="mt-1 text-sm text-gray-500">
						Current Safe nonce: <span className="font-medium">{config.nonce.toString()}</span> - Leave blank or use this to
						use current Safe nonce.
					</p>
					{!isNonceValid && nonce !== "" && (
						<p className="mt-1 text-sm text-red-600">Please enter a valid non-negative integer.</p>
					)}
				</div>

				<div className="pt-4">
					<button
						type="submit"
						disabled={
							isSubmitting ||
							!isTokenAddressValid ||
							!tokenAddress ||
							!isRecipientValid ||
							!recipient ||
							!isAmountValid ||
							!amount ||
							decimals === null || // Crucial: ensure decimals are fetched
							isFetchingDecimals ||
							!!fetchDecimalsError ||
							!isNonceValid
						}
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
							"Sign & Enqueue ERC20 Transfer"
						)}
					</button>
				</div>

				{txHash && (
					<div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-md">
						<h3 className="text-sm font-medium text-green-800">Transaction Submitted</h3>
						<p className="mt-1 text-sm text-green-700">
							Transaction Hash: <span className="font-mono break-all">{txHash}</span>
						</p>
						<p className="mt-1 text-sm text-green-700">
							It will be enqueued on Harbour and then proposed to your Safe.
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
	);
}
