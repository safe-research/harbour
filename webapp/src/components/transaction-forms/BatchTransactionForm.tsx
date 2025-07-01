import { useNavigate } from "@tanstack/react-router";
import { ethers } from "ethers";
import { useState } from "react";
import type { BatchedTransaction } from "@/contexts/BatchTransactionsContext";
import { useBatch } from "@/contexts/BatchTransactionsContext";
import { signAndEnqueueSafeTransaction } from "@/lib/harbour";
import { encodeMultiSend, MULTISEND_CALL_ONLY_ADDRESS } from "@/lib/multisend";
import { getSafeTransaction } from "@/lib/safe";
import type { CommonTransactionFormProps } from "./types";

/**
 * Component for displaying and enqueuing a batch of transactions via the multisend contract.
 */
export function BatchTransactionForm({
	safeAddress,
	chainId,
	browserProvider,
	config,
}: CommonTransactionFormProps) {
	const { getBatch, removeTransaction, clearBatch } = useBatch();
	const navigate = useNavigate();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [txHash, setTxHash] = useState<string>();
	const [error, setError] = useState<string>();

	const transactions: BatchedTransaction[] = getBatch(safeAddress, chainId);

	const handleRemove = (index: number) => {
		removeTransaction(safeAddress, chainId, index);
	};

	const handleEnqueueBatch = async () => {
		setError(undefined);
		setTxHash(undefined);

		if (transactions.length === 0) {
			setError("No transactions in batch");
			return;
		}

		try {
			setIsSubmitting(true);
			const multiData = encodeMultiSend(transactions);

			const transaction = getSafeTransaction({
				chainId,
				safeAddress,
				to: MULTISEND_CALL_ONLY_ADDRESS,
				value: "0",
				data: multiData,
				nonce: config.nonce.toString(),
			});

			const receipt = await signAndEnqueueSafeTransaction(
				browserProvider,
				transaction,
			);
			setTxHash(receipt.transactionHash);
			clearBatch(safeAddress, chainId);
			navigate({ to: "/queue", search: { safe: safeAddress, chainId } });
		} catch (err: unknown) {
			const message =
				err instanceof Error ? err.message : "Batch enqueue failed";
			setError(message);
		} finally {
			setIsSubmitting(false);
		}
	};

	return (
		<div className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
			<div className="flex items-center justify-between mb-4">
				<h2 className="text-xl font-semibold">Batch Transactions</h2>
				<button
					type="button"
					onClick={() => clearBatch(safeAddress, chainId)}
					disabled={isSubmitting || transactions.length === 0}
					className="text-sm text-blue-600 hover:underline disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Clear All
				</button>
			</div>
			{transactions.length === 0 ? (
				<p className="text-gray-600">No transactions added to batch.</p>
			) : (
				<ul className="space-y-2 mb-4">
					{transactions.map((tx, index) => (
						<li
							key={`${tx.to}-${index}`}
							className="flex justify-between items-center p-2 border border-gray-300 rounded"
						>
							<div className="text-sm">
								<p>
									<span className="font-medium">To:</span> {tx.to}
								</p>
								<p>
									<span className="font-medium">Value:</span>{" "}
									{ethers.formatEther(tx.value)} {tx.value !== "0" ? "ETH" : ""}
								</p>
								{tx.data && tx.data !== "0x" && (
									<p className="font-mono text-xs break-all">{tx.data}</p>
								)}
							</div>
							<button
								type="button"
								onClick={() => handleRemove(index)}
								className="ml-4 px-2 py-1 text-xs text-red-600 hover:text-red-800"
							>
								Remove
							</button>
						</li>
					))}
				</ul>
			)}
			<div className="flex space-x-4">
				<button
					type="button"
					onClick={handleEnqueueBatch}
					disabled={isSubmitting || transactions.length === 0}
					className="flex-1 px-6 py-3 bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{isSubmitting ? "Processing..." : "Enqueue Batch"}
				</button>
			</div>
			{txHash && (
				<div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-md">
					<h3 className="text-sm font-medium text-green-800">Batch Enqueued</h3>
					<p className="mt-1 text-sm text-green-700">
						Transaction Hash:{" "}
						<span className="font-mono break-all">{txHash}</span>
					</p>
				</div>
			)}
			{error && (
				<div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-md">
					<h3 className="text-sm font-medium text-red-800">Error</h3>
					<p className="mt-1 text-sm text-red-700">{error}</p>
				</div>
			)}
		</div>
	);
}
