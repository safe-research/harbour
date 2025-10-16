import { zodResolver } from "@hookform/resolvers/zod";
import { ethers } from "ethers";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { BatchedTransaction } from "@/contexts/BatchTransactionsContext";
import { useBatch } from "@/contexts/BatchTransactionsContext";
import { useSignAndEnqueue } from "@/hooks/useSignAndEnqueue";
import { encodeMultiSend, MULTISEND_CALL_ONLY_ADDRESS } from "@/lib/multisend";
import { nonceSchema } from "@/lib/validators";
import type { CommonTransactionFormProps } from "./types";

const createBatchTransactionFormSchema = (currentSafeNonce: string) =>
	z.object({
		nonce: nonceSchema(currentSafeNonce),
	});

type BatchTransactionFormData = z.infer<
	ReturnType<typeof createBatchTransactionFormSchema>
>;

/**
 * Component for displaying and enqueuing a batch of transactions via the multisend contract.
 */
export function BatchTransactionForm({
	safeAddress,
	chainId,
	browserProvider,
	config,
	encryptedQueue,
}: CommonTransactionFormProps) {
	const { getBatch, removeTransaction, clearBatch } = useBatch();

	const parser = (tx: BatchTransactionFormData) => {
		const multiData = encodeMultiSend(transactions);

		return {
			to: MULTISEND_CALL_ONLY_ADDRESS,
			value: "0",
			data: multiData,
			operation: 1,
			...tx,
		};
	};

	const { isSubmitting, error, txHash, signAndEnqueue } = useSignAndEnqueue({
		safeAddress,
		chainId,
		browserProvider,
		config,
		encryptedQueue,
		parser,
		onEnqueued: () => {
			clearBatch(safeAddress, chainId);
		},
	});

	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm<BatchTransactionFormData>({
		resolver: zodResolver(
			createBatchTransactionFormSchema(config.nonce.toString()),
		),
		defaultValues: {
			nonce: config.nonce.toString(),
		},
	});

	const transactions: BatchedTransaction[] = getBatch(safeAddress, chainId);

	const handleRemove = (index: number) => {
		removeTransaction(safeAddress, chainId, index);
	};

	return (
		<div className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
			<form onSubmit={handleSubmit(signAndEnqueue)} className="space-y-6">
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
										{ethers.formatEther(tx.value)}{" "}
										{tx.value !== "0" ? "ETH" : ""}
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

				<div>
					<label
						htmlFor="nonce"
						className="block text-sm font-medium text-gray-700 mb-1"
					>
						Nonce
					</label>
					<input
						id="nonce"
						type="number"
						{...register("nonce")}
						min="0"
						step="1"
						className="mt-1 block w-full border border-gray-300 bg-white text-gray-900 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900"
					/>
					<p className="mt-1 text-sm text-gray-500">
						Current Safe nonce:{" "}
						<span className="font-medium">{config.nonce.toString()}</span>
					</p>
					{errors.nonce && (
						<p className="mt-1 text-sm text-red-600">{errors.nonce.message}</p>
					)}
				</div>

				<div className="flex space-x-4">
					<button
						type="submit"
						disabled={isSubmitting || transactions.length === 0}
						className="flex-1 px-6 py-3 bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{isSubmitting ? "Processing..." : "Enqueue Batch"}
					</button>
				</div>
				{txHash && (
					<div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-md">
						<h3 className="text-sm font-medium text-green-800">
							Batch Enqueued
						</h3>
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
			</form>
		</div>
	);
}
