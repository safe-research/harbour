import { zodResolver } from "@hookform/resolvers/zod";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useWalletConnectTransaction } from "@/hooks/useWalletConnectTransaction";
import {
	ethereumAddressSchema,
	ethValueSchema,
	hexDataSchema,
	nonceSchema,
} from "@/lib/validators";
import { TransactionAlerts } from "./TransactionAlerts";
import { TransactionFormFields } from "./TransactionFormFields";
import type { CommonTransactionFormProps } from "./types";

interface WalletConnectFormProps extends CommonTransactionFormProps {
	txTo?: string;
	txValue?: string;
	txData?: string;
	wcApp: string;
	wcAppUrl?: string;
	wcAppIcon?: string;
	wcAppDescription?: string;
	topic: string;
	reqId: string;
}

const createWalletConnectFormSchema = (currentSafeNonce: string | bigint) =>
	z.object({
		to: ethereumAddressSchema,
		value: ethValueSchema,
		data: hexDataSchema,
		nonce: nonceSchema(currentSafeNonce),
	});

type WalletConnectFormData = z.infer<
	ReturnType<typeof createWalletConnectFormSchema>
>;

interface WalletConnectAppInfoProps {
	wcApp: string;
	wcAppUrl?: string;
	wcAppIcon?: string;
	wcAppDescription?: string;
}

/**
 * Displays information about the WalletConnect dApp making the request
 */
function WalletConnectAppInfo({
	wcApp,
	wcAppUrl,
	wcAppIcon,
	wcAppDescription,
}: WalletConnectAppInfoProps) {
	return (
		<div className="mb-6 pb-6 border-b border-gray-200">
			<div className="flex items-start space-x-4">
				{wcAppIcon && (
					<img
						src={wcAppIcon}
						alt={`${wcApp} logo`}
						className="w-12 h-12 rounded-lg object-contain bg-gray-50 p-1"
						onError={(e) => {
							e.currentTarget.style.display = "none";
						}}
					/>
				)}
				<div className="flex-1">
					<h3 className="text-lg font-semibold text-gray-900">{wcApp}</h3>
					{wcAppUrl && (
						<a
							href={wcAppUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
						>
							{wcAppUrl}
						</a>
					)}
					{wcAppDescription && (
						<p className="mt-2 text-sm text-gray-600">{wcAppDescription}</p>
					)}
				</div>
			</div>
		</div>
	);
}

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
	wcAppUrl,
	wcAppIcon,
	wcAppDescription,
	topic,
	reqId,
}: WalletConnectFormProps) {
	const navigate = useNavigate();
	const {
		submitTransaction,
		transactionHash,
		error,
		warning,
		isSubmitting,
		clearResult,
	} = useWalletConnectTransaction();

	const formSchema = useMemo(
		() => createWalletConnectFormSchema(config.nonce),
		[config.nonce],
	);

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
			nonce: config.nonce,
		},
	});

	// Navigate to queue when transaction is successful
	useEffect(() => {
		if (transactionHash) {
			navigate({ to: "/queue", search: { safe: safeAddress, chainId } });
		}
	}, [transactionHash, navigate, safeAddress, chainId]);

	const onSubmit = async (data: WalletConnectFormData) => {
		clearResult();

		const currentNonce =
			data.nonce === "" ? BigInt(config.nonce) : BigInt(data.nonce);

		await submitTransaction({
			safeAddress,
			chainId,
			browserProvider,
			to: data.to,
			value: data.value || "0",
			data: data.data || "0x",
			nonce: currentNonce.toString(),
			topic,
			reqId,
		});
	};

	return (
		<div className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
			{wcApp && (
				<WalletConnectAppInfo
					wcApp={wcApp}
					wcAppUrl={wcAppUrl}
					wcAppIcon={wcAppIcon}
					wcAppDescription={wcAppDescription}
				/>
			)}
			<form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
				<TransactionFormFields
					register={register}
					errors={errors}
					currentNonce={config.nonce}
				/>

				<div className="pt-4">
					<button
						type="submit"
						disabled={isSubmitting}
						className="w-full flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
					>
						{isSubmitting ? "Processing…" : "Sign & Enqueue Transaction"}
					</button>
				</div>

				<TransactionAlerts
					transactionHash={transactionHash}
					error={error}
					warning={warning}
				/>
			</form>
		</div>
	);
}
