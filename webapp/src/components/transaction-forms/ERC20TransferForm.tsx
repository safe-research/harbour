import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { ethers } from "ethers";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useBatch } from "@/contexts/BatchTransactionsContext";
import { useERC20TokenDetails } from "@/hooks/useERC20TokenDetails";
import { encodeERC20Transfer } from "@/lib/erc20";
import { signAndEnqueueSafeTransaction } from "@/lib/harbour";
import { getSafeTransaction } from "@/lib/safe";
import {
	ethereumAddressSchema,
	nonceSchema,
	positiveAmountSchema,
} from "@/lib/validators";
import type { ERC20TransferFormProps } from "./types";

const createERC20TransferFormSchema = (currentSafeNonce: string) =>
	z.object({
		tokenAddress: ethereumAddressSchema,
		recipient: ethereumAddressSchema,
		amount: positiveAmountSchema,
		nonce: nonceSchema(currentSafeNonce),
	});

type ERC20TransferFormData = z.infer<
	ReturnType<typeof createERC20TransferFormSchema>
>;

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
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [txHash, setTxHash] = useState<string>();
	const [error, setError] = useState<string>();

	const {
		register,
		handleSubmit,
		watch,
		formState: { errors },
	} = useForm<ERC20TransferFormData>({
		resolver: zodResolver(
			createERC20TransferFormSchema(config.nonce.toString()),
		),
		defaultValues: {
			tokenAddress: initialTokenAddress || "",
			nonce: config.nonce.toString(),
		},
	});

	const tokenAddress = watch("tokenAddress");

	const {
		data: tokenDetails,
		isLoading: isFetchingDetails,
		error: fetchDetailsError,
	} = useERC20TokenDetails(rpcProvider, tokenAddress, safeAddress, chainId);
	const decimals = tokenDetails?.decimals ?? null;

	// Determine if the form has all prerequisites fulfilled for batching
	const recipient = watch("recipient");
	const amount = watch("amount");

	const canAddToBatch =
		decimals !== null &&
		!isFetchingDetails &&
		!fetchDetailsError &&
		recipient.trim() !== "" &&
		amount.trim() !== "" &&
		Object.keys(errors).length === 0;

	const onSubmit = async (data: ERC20TransferFormData) => {
		setError(undefined);
		setTxHash(undefined);

		if (decimals === null) {
			setError(
				"Token decimals could not be determined. Please check the token address and network.",
			);
			return;
		}

		const currentNonce =
			data.nonce === "" ? BigInt(config.nonce) : BigInt(data.nonce);

		try {
			setIsSubmitting(true);

			const amountInSmallestUnit = ethers.parseUnits(data.amount, decimals);
			const encodedTransferData = encodeERC20Transfer(
				data.recipient,
				amountInSmallestUnit,
			);

			const transaction = getSafeTransaction({
				chainId,
				safeAddress,
				to: data.tokenAddress,
				value: "0",
				data: encodedTransferData,
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

	const isTokenAddressValid = tokenAddress && !errors.tokenAddress;

	const { addTransaction } = useBatch();
	const handleAddToBatch = handleSubmit((data: ERC20TransferFormData) => {
		if (decimals === null) return;
		const amountInSmallestUnit = ethers.parseUnits(data.amount, decimals);
		const encodedData = encodeERC20Transfer(
			data.recipient,
			amountInSmallestUnit,
		);
		addTransaction({
			to: data.tokenAddress,
			value: "0",
			data: encodedData,
			safeAddress,
			chainId,
		});
	});

	return (
		<div className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
			<form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
				<div>
					<label
						htmlFor="tokenAddress"
						className="block text-sm font-medium text-gray-700 mb-1"
					>
						Token Contract Address
					</label>
					<input
						id="tokenAddress"
						type="text"
						{...register("tokenAddress")}
						placeholder="0x..."
						className="mt-1 block w-full border border-gray-300 bg-white text-gray-900 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900"
					/>
					{errors.tokenAddress && (
						<p className="mt-1 text-sm text-red-600">
							{errors.tokenAddress.message}
						</p>
					)}
					{isFetchingDetails && (
						<p className="mt-1 text-sm text-gray-500">
							Fetching token details...
						</p>
					)}
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
								<strong>Token:</strong> {tokenDetails.name} (
								{tokenDetails.symbol})
							</p>
							<p>
								<strong>Decimals:</strong> {decimals}
							</p>
						</div>
					)}
				</div>

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
						Amount (in tokens)
					</label>
					{decimals !== null && tokenDetails && (
						<p className="mt-1 text-sm text-gray-500">
							Balance: {ethers.formatUnits(tokenDetails.balance, decimals)}{" "}
							{tokenDetails.symbol}
						</p>
					)}
					<input
						id="amount"
						type="text"
						{...register("amount")}
						placeholder="e.g., 100"
						className="mt-1 block w-full border border-gray-300 bg-white text-gray-900 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900"
						disabled={decimals === null && !!isTokenAddressValid}
					/>
					{errors.amount && (
						<p className="mt-1 text-sm text-red-600">{errors.amount.message}</p>
					)}
					{decimals === null &&
						isTokenAddressValid &&
						!isFetchingDetails &&
						!fetchDetailsError && (
							<p className="mt-1 text-sm text-yellow-600">
								Enter a valid token address to enable amount input.
							</p>
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
							"Sign & Enqueue ERC20 Transfer"
						)}
					</button>
					<button
						type="button"
						onClick={handleAddToBatch}
						disabled={!canAddToBatch}
						className="flex-1 flex justify-center items-center px-6 py-3 border border-gray-900 text-base font-medium rounded-md text-gray-900 bg-white hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
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
