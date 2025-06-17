import { signAndEnqueueSafeTransaction } from "@/lib/harbour";
import { getSafeTransaction } from "@/lib/safe";
import { ethValueSchema, ethereumAddressSchema, hexDataSchema, nonceSchema } from "@/lib/validators";
import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { ethers } from "ethers";
import { useState, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import type { CommonTransactionFormProps } from "./types";
import { useWalletConnect } from "@/hooks/walletConnect";

interface WalletConnectFormProps extends CommonTransactionFormProps {
	txTo?: string;
	txValue?: string;
	txData?: string;
	wcApp?: string;
	topic?: string;
	reqId?: string;
}

const createWalletConnectFormSchema = (currentSafeNonce: string) =>
	z.object({
		to: ethereumAddressSchema,
		value: ethValueSchema,
		data: hexDataSchema,
		nonce: nonceSchema(currentSafeNonce),
	});

type WalletConnectFormData = z.infer<ReturnType<typeof createWalletConnectFormSchema>>;

/**
 * Tailored form for transactions arriving via WalletConnect. Fields are pre-populated
 * from the WalletConnect request but remain editable so the user can double-check
 * and adjust before signing.
 */
export function WalletConnectTransactionForm({
	safeAddress,
	chainId,
	browserProvider,
	config,
	txTo,
	txValue,
	txData,
	wcApp,
	topic,
	reqId,
}: WalletConnectFormProps) {
	const { walletkit } = useWalletConnect();
	const navigate = useNavigate();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [txHash, setTxHash] = useState<string>();
	const [error, setError] = useState<string>();
	const [warning, setWarning] = useState<string>();

	// Memoize form schema to prevent recreation on every render
	const formSchema = useMemo(() => createWalletConnectFormSchema(config.nonce.toString()), [config.nonce]);

	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm<WalletConnectFormData>({
		resolver: zodResolver(formSchema),
		defaultValues: {
			to: txTo ?? "",
			value: txValue ?? "0",
			data: txData ?? "",
			nonce: config.nonce.toString(),
		},
	});

	const onSubmit = async (data: WalletConnectFormData) => {
		setError(undefined);
		setTxHash(undefined);

		const currentNonce = data.nonce === "" ? BigInt(config.nonce) : BigInt(data.nonce);

		try {
			setIsSubmitting(true);

			const transaction = getSafeTransaction({
				chainId,
				safeAddress,
				to: data.to,
				value: ethers.parseEther(data.value || "0").toString(),
				data: data.data || "0x",
				nonce: currentNonce.toString(),
			});

			const receipt = await signAndEnqueueSafeTransaction(browserProvider, transaction);

			setTxHash(receipt.transactionHash);

			// Respond to WalletConnect session request with the transaction hash
			try {
				if (walletkit && topic && reqId) {
					await walletkit.respondSessionRequest({
						topic,
						response: {
							id: Number(reqId),
							jsonrpc: "2.0",
							result: receipt.transactionHash,
						},
					});
				}
			} catch (err: unknown) {
				console.error("Failed to respond to WalletConnect session request", err);
				// Show non-blocking warning to user
				setWarning("Transaction submitted but WalletConnect response failed. The dApp may not be notified.");
			}

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
			{wcApp && (
				<p className="mb-4 text-sm text-gray-600">
					<strong>Origin:&nbsp;</strong>
					{wcApp}
				</p>
			)}
			<form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
				<div>
					<label htmlFor="to" className="block text-sm font-medium text-gray-700 mb-1">
						To Address
					</label>
					<input
						id="to"
						type="text"
						{...register("to")}
						placeholder="0x..."
						className="mt-1 block w-full border border-gray-300 bg-white text-gray-900 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900"
					/>
					{errors.to && <p className="mt-1 text-sm text-red-600">{errors.to.message}</p>}
				</div>

				<div>
					<label htmlFor="value" className="block text-sm font-medium text-gray-700 mb-1">
						Value (ETH)
					</label>
					<input
						id="value"
						type="text"
						{...register("value")}
						placeholder="0.0"
						className="mt-1 block w-full border border-gray-300 bg-white text-gray-900 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900"
					/>
					{errors.value && <p className="mt-1 text-sm text-red-600">{errors.value.message}</p>}
				</div>

				<div>
					<label htmlFor="data" className="block text-sm font-medium text-gray-700 mb-1">
						Data (Hex String)
					</label>
					<input
						id="data"
						type="text"
						{...register("data")}
						placeholder="0x..."
						className="mt-1 block w-full border border-gray-300 bg-white text-gray-900 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900 font-mono text-sm"
					/>
					{errors.data && <p className="mt-1 text-sm text-red-600">{errors.data.message}</p>}
				</div>

				<div>
					<label htmlFor="nonce" className="block text-sm font-medium text-gray-700 mb-1">
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
						Current Safe nonce: <span className="font-medium">{config.nonce.toString()}</span>
					</p>
					{errors.nonce && <p className="mt-1 text-sm text-red-600">{errors.nonce.message}</p>}
				</div>

				<div className="pt-4">
					<button
						type="submit"
						disabled={isSubmitting}
						className="w-full flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
					>
						{isSubmitting ? "Processing…" : "Sign & Enqueue Transaction"}
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

				{warning && (
					<div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
						<h3 className="text-sm font-medium text-yellow-800">Warning</h3>
						<p className="mt-1 text-sm text-yellow-700">{warning}</p>
					</div>
				)}
			</form>
		</div>
	);
}
