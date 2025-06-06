import { useERC20TokenDetails } from "@/hooks/useERC20TokenDetails";
import { encodeERC20Transfer } from "@/lib/erc20";
import { signAndEnqueueSafeTransaction } from "@/lib/harbour";
import { getSafeTransaction } from "@/lib/safe";
import { nonceSchema } from "@/lib/validators";
import { useNavigate } from "@tanstack/react-router";
import { ethers, isAddress } from "ethers";
import type React from "react";
import { useState } from "react";
import type { ERC20TransferFormProps } from "./types";

/**
 * A form component for creating and enqueuing an ERC20 token transfer transaction
 * for a Safe. It handles fetching token decimals, input validation,
 * transaction encoding, signing, and submission to the Harbour contract.
 */
export function ERC20TransferForm({
	safeAddress,
	chainId,
	browserProvider,
	rpcProvider,
	config,
	tokenAddress: initialTokenAddress,
}: ERC20TransferFormProps) {
	const navigate = useNavigate();

	const [tokenAddress, setTokenAddress] = useState(initialTokenAddress || "");
	const [recipient, setRecipient] = useState("");
	const [amount, setAmount] = useState("");

	const [nonce, setNonce] = useState(config.nonce.toString());

	const [isSubmitting, setIsSubmitting] = useState(false);
	const [txHash, setTxHash] = useState<string>();
	const [error, setError] = useState<string>();

	const {
		data: tokenDetails,
		isLoading: isFetchingDetails,
		error: fetchDetailsError,
	} = useERC20TokenDetails(rpcProvider, tokenAddress, safeAddress, chainId);
	const decimals = tokenDetails?.decimals ?? null;

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

		const numericAmount = Number(amount);
		if (Number.isNaN(numericAmount) || numericAmount <= 0 || !Number.isFinite(numericAmount)) {
			setError("Invalid Amount. Must be a positive number.");
			return;
		}

		if (decimals === null) {
			setError("Token decimals could not be determined. Please check the token address and network.");
			return;
		}

		const nonceParse = nonceSchema(config.nonce.toString()).safeParse(nonce);
		if (!nonceParse.success) {
			setError(nonceParse.error.errors[0].message);
			return;
		}
		const currentNonce = nonce === "" ? BigInt(config.nonce) : BigInt(nonce);

		try {
			setIsSubmitting(true);

			const amountInSmallestUnit = ethers.parseUnits(amount, decimals);
			const encodedTransferData = encodeERC20Transfer(recipient, amountInSmallestUnit);

			const transaction = getSafeTransaction({
				chainId,
				safeAddress,
				to: tokenAddress,
				value: "0", // Value is 0 for token transfers
				data: encodedTransferData,
				nonce: currentNonce.toString(),
			});

			const receipt = await signAndEnqueueSafeTransaction(browserProvider, transaction);

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
					{isFetchingDetails && <p className="mt-1 text-sm text-gray-500">Fetching token details...</p>}
					{fetchDetailsError && (
						<p className="mt-1 text-sm text-red-600">
							{fetchDetailsError instanceof Error
								? `Unable to fetch token details: ${fetchDetailsError.message}`
								: "Unable to fetch token details. Please verify the address and network."}
						</p>
					)}
					{decimals !== null && tokenDetails && (
						<div className="mt-1 text-sm text-green-600 space-y-1">
							<p>
								<strong>Token:</strong> {tokenDetails.name} ({tokenDetails.symbol})
							</p>
							<p>
								<strong>Decimals:</strong> {decimals}
							</p>
						</div>
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
				</div>

				<div>
					<label htmlFor="amount" className="block text-sm font-medium text-gray-700 mb-1">
						Amount (in tokens)
					</label>
					{decimals !== null && tokenDetails && (
						<p className="mt-1 text-sm text-gray-500">
							Balance: {ethers.formatUnits(tokenDetails.balance, decimals)} {tokenDetails.symbol}
						</p>
					)}
					<input
						id="amount"
						type="number"
						step="any"
						min="0"
						value={amount}
						onChange={(e) => setAmount(e.target.value)}
						placeholder="e.g., 100"
						className="mt-1 block w-full border border-gray-300 bg-white text-gray-900 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900"
						required
						disabled={decimals === null && isAddress(tokenAddress)}
					/>
					{decimals === null && isAddress(tokenAddress) && !isFetchingDetails && !fetchDetailsError && (
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
						Current Safe nonce: <span className="font-medium">{config.nonce.toString()}</span> - Leave blank or use this
						to use current Safe nonce.
					</p>
				</div>

				<div className="pt-4">
					<button
						type="submit"
						disabled={isSubmitting}
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
