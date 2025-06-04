import { switchToChain } from "@/lib/chains";
import { HARBOUR_CHAIN_ID, enqueueSafeTransaction } from "@/lib/harbour";
import { signSafeTransaction } from "@/lib/safe";
import type { FullSafeTransaction } from "@/lib/types";
import { useNavigate } from "@tanstack/react-router";
import { ethers, isAddress } from "ethers";
import type React from "react";
import { useState } from "react";
import type { CommonTransactionFormProps } from "./types";

/**
 * A form component for creating and enqueuing a native currency (ETH) transfer transaction
 * for a Safe. It handles input validation, transaction signing, and submission
 * to the Harbour contract.
 */
export function NativeTransferForm({ safeAddress, chainId, browserProvider, config }: CommonTransactionFormProps) {
	const navigate = useNavigate();

	const [recipient, setRecipient] = useState("");
	const [amount, setAmount] = useState("");
	const [nonce, setNonce] = useState(config.nonce.toString());
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [txHash, setTxHash] = useState<string>();
	const [error, setError] = useState<string>();

	const isRecipientValid = recipient === "" || isAddress(recipient);
	const isAmountValid = amount === "" || (!Number.isNaN(Number(amount)) && Number(amount) > 0);
	const isNonceValid =
		nonce === "" || (!Number.isNaN(Number(nonce)) && Number.isInteger(Number(nonce)) && Number(nonce) >= 0);

	const handleSubmit = async (e: React.FormEvent) => {
		e.preventDefault();
		setError(undefined);
		setTxHash(undefined);

		if (!isAddress(recipient)) {
			setError("Invalid recipient address.");
			return;
		}
		if (Number.isNaN(Number(amount)) || Number(amount) <= 0) {
			setError("Invalid amount. Must be a positive number.");
			return;
		}
		const currentNonce = nonce !== "" ? BigInt(nonce) : config.nonce;
		if (Number.isNaN(currentNonce) || BigInt(currentNonce) < 0) {
			setError("Invalid nonce. Must be a non-negative integer.");
			return;
		}

		try {
			setIsSubmitting(true);

			const transaction: FullSafeTransaction = {
				to: recipient,
				value: ethers.parseEther(amount).toString(),
				data: "0x",
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

			// Switch to Safe's chain for signing
			await switchToChain(browserProvider, chainId);
			const signer = await browserProvider.getSigner();
			const signature = await signSafeTransaction(signer, transaction);

			// Switch to Harbour chain for enqueuing
			await switchToChain(browserProvider, HARBOUR_CHAIN_ID);
			const receipt = await enqueueSafeTransaction(signer, transaction, signature);

			setTxHash(receipt.transactionHash);
			// Navigate to queue page after successful enqueue
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
						Amount (ETH)
					</label>
					<input
						id="amount"
						type="text"
						value={amount}
						onChange={(e) => setAmount(e.target.value)}
						placeholder="0.0"
						className="mt-1 block w-full border border-gray-300 bg-white text-gray-900 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900"
						required
					/>
					{!isAmountValid && amount !== "" && (
						<p className="mt-1 text-sm text-red-600">Please enter a valid positive number.</p>
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
					{!isNonceValid && nonce !== "" && (
						<p className="mt-1 text-sm text-red-600">Please enter a valid non-negative integer.</p>
					)}
				</div>

				<div className="pt-4">
					<button
						type="submit"
						disabled={isSubmitting || !isRecipientValid || !recipient || !isAmountValid || !amount || !isNonceValid}
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
							"Sign & Enqueue Native Transfer"
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
