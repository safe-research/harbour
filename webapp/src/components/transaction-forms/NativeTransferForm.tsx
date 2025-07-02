import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { ethers } from "ethers";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useBatch } from "@/contexts/BatchTransactionsContext";
import { useNativeBalance } from "@/hooks/useNativeBalance";
import { signAndEnqueueSafeTransaction } from "@/lib/harbour";
import { getSafeTransaction } from "@/lib/safe";
import {
	ethereumAddressSchema,
	nonceSchema,
	positiveAmountSchema,
} from "@/lib/validators";
import type { CommonTransactionFormProps } from "./types";

const createNativeTransferFormSchema = (currentSafeNonce: string) =>
	z.object({
		recipient: ethereumAddressSchema,
		amount: positiveAmountSchema,
		nonce: nonceSchema(currentSafeNonce),
	});

type NativeTransferFormData = z.infer<
	ReturnType<typeof createNativeTransferFormSchema>
>;

/**
 * A form component for creating and enqueuing a native currency (ETH) transfer transaction
 * for a Safe. It handles input validation, transaction signing, and submission
 * to the Harbour contract.
 */
export function NativeTransferForm({
	safeAddress,
	chainId,
	browserProvider,
	rpcProvider,
	config,
}: CommonTransactionFormProps) {
	const navigate = useNavigate();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [txHash, setTxHash] = useState<string>();
	const [error, setError] = useState<string>();
	const { addTransaction } = useBatch();

	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm<NativeTransferFormData>({
		resolver: zodResolver(
			createNativeTransferFormSchema(config.nonce.toString()),
		),
		defaultValues: {
			nonce: config.nonce.toString(),
		},
	});

	const handleAddToBatch = handleSubmit((data: NativeTransferFormData) => {
		const tx = {
			to: data.recipient,
			value: ethers.parseEther(data.amount).toString(),
			data: "0x",
			safeAddress,
			chainId,
		};
		addTransaction(tx);
	});

	const {
		data: balance,
		isLoading: isLoadingBalance,
		error: balanceError,
	} = useNativeBalance(rpcProvider, safeAddress, chainId);

	const onSubmit = async (data: NativeTransferFormData) => {
		setError(undefined);
		setTxHash(undefined);

		const currentNonce =
			data.nonce === "" ? BigInt(config.nonce) : BigInt(data.nonce);

		try {
			setIsSubmitting(true);

			const transaction = getSafeTransaction({
				chainId,
				safeAddress,
				to: data.recipient,
				value: ethers.parseEther(data.amount).toString(),
				nonce: currentNonce.toString(),
			});

			const receipt = await signAndEnqueueSafeTransaction(
				browserProvider,
				transaction,
			);

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
			<form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
				<div>
					<label
						htmlFor="recipient"
						className="block text-sm font-medium text-gray-700 mb-1"
					>
						Recipient Address
					</label>
					<input
						id="recipient"
						type="text"
						{...register("recipient")}
						placeholder="0x..."
						className="mt-1 block w-full border border-gray-300 bg-white text-gray-900 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900"
					/>
					{errors.recipient && (
						<p className="mt-1 text-sm text-red-600">
							{errors.recipient.message}
						</p>
					)}
				</div>

				<div>
					<label
						htmlFor="amount"
						className="block text-sm font-medium text-gray-700 mb-1"
					>
						Amount (ETH)
					</label>
					{balance !== undefined && (
						<p className="mt-1 text-sm text-gray-500">
							Balance: {ethers.formatEther(balance)} ETH
						</p>
					)}
					{isLoadingBalance && (
						<p className="mt-1 text-sm text-gray-500">Loading balance...</p>
					)}
					{balanceError && (
						<p className="mt-1 text-sm text-red-600">
							Error loading balance: {balanceError.message}
						</p>
					)}
					<input
						id="amount"
						type="text"
						{...register("amount")}
						placeholder="0.0"
						className="mt-1 block w-full border border-gray-300 bg-white text-gray-900 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900"
					/>
					{errors.amount && (
						<p className="mt-1 text-sm text-red-600">{errors.amount.message}</p>
					)}
				</div>

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
						<span className="font-medium">{config.nonce.toString()}</span> -
						Leave blank or use this to use current Safe nonce.
					</p>
					{errors.nonce && (
						<p className="mt-1 text-sm text-red-600">{errors.nonce.message}</p>
					)}
				</div>

				<div className="pt-4 flex space-x-4">
					<button
						type="submit"
						disabled={isSubmitting}
						className="flex-1 flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
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
									<circle
										className="opacity-25"
										cx="12"
										cy="12"
										r="10"
										stroke="currentColor"
										strokeWidth="4"
									/>
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
					<button
						type="button"
						onClick={handleAddToBatch}
						className="flex-1 flex justify-center items-center px-6 py-3 border border-gray-900 text-base font-medium rounded-md text-gray-900 bg-white hover:bg-gray-100 transition-colors duration-200"
					>
						Add to Batch
					</button>
				</div>

				{txHash && (
					<div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-md">
						<h3 className="text-sm font-medium text-green-800">
							Transaction Submitted
						</h3>
						<p className="mt-1 text-sm text-green-700">
							Transaction Hash:{" "}
							<span className="font-mono break-all">{txHash}</span>
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
