import type { BrowserProvider } from "ethers";
import { ethers } from "ethers";
import { useCallback, useState } from "react";
import { useWalletConnect } from "@/hooks/walletConnect";
import { signAndEnqueueSafeTransaction } from "@/lib/harbour";
import { getSafeTransaction } from "@/lib/safe";

type WalletConnectTransactionParams = {
	safeAddress: string;
	chainId: number;
	browserProvider: BrowserProvider;
	to: string;
	value: string;
	data: string;
	nonce: string;
	topic?: string;
	reqId?: string;
};

type WalletConnectTransactionResult = {
	transactionHash?: string;
	error?: string;
	warning?: string;
	isSubmitting: boolean;
};

/**
 * Hook for handling WalletConnect transaction submissions.
 * Manages the flow of submitting transactions to Safe and responding to WalletConnect requests.
 * Provides clear separation between transaction success and WalletConnect notification.
 *
 * @returns Object containing transaction result state and submission functions
 */
export function useWalletConnectTransaction() {
	const { walletkit } = useWalletConnect();
	const [result, setResult] = useState<WalletConnectTransactionResult>({
		isSubmitting: false,
	});

	/**
	 * Submits a transaction to Safe and responds to the WalletConnect session request.
	 * Handles both success and failure cases, ensuring proper WalletConnect responses.
	 *
	 * @param params - Transaction parameters including Safe details and WalletConnect session info
	 */
	const submitTransaction = useCallback(
		async (params: WalletConnectTransactionParams): Promise<void> => {
			const {
				safeAddress,
				chainId,
				browserProvider,
				to,
				value,
				data,
				nonce,
				topic,
				reqId,
			} = params;

			setResult({ isSubmitting: true });

			try {
				// 1. Submit transaction to Safe
				const transaction = getSafeTransaction({
					chainId,
					safeAddress,
					to,
					value: ethers.parseEther(value || "0").toString(),
					data: data || "0x",
					nonce,
				});

				const receipt = await signAndEnqueueSafeTransaction(
					browserProvider,
					transaction,
				);

				// 2. Attempt to respond to WalletConnect session (separate from transaction success)
				let wcResponseResult: { success: boolean; error?: string } = {
					success: true,
				};

				if (walletkit && topic && reqId) {
					try {
						await walletkit.respondSessionRequest({
							topic,
							response: {
								id: Number(reqId),
								jsonrpc: "2.0",
								result: receipt.hash,
							},
						});
					} catch (err: unknown) {
						console.error(
							"Failed to respond to WalletConnect session request",
							err,
						);
						wcResponseResult = {
							success: false,
							error: err instanceof Error ? err.message : "Unknown error",
						};
					}
				}

				// 3. Update result based on both transaction and WC response
				setResult({
					isSubmitting: false,
					transactionHash: receipt.transactionHash,
					warning: !wcResponseResult.success
						? "Transaction submitted but WalletConnect response failed. The dApp may not be notified."
						: undefined,
				});
			} catch (err: unknown) {
				// 4. Handle transaction submission errors
				const message =
					err instanceof Error ? err.message : "Transaction failed";

				// If transaction failed, still try to respond to WalletConnect with error
				if (walletkit && topic && reqId) {
					try {
						await walletkit.respondSessionRequest({
							topic,
							response: {
								id: Number(reqId),
								jsonrpc: "2.0",
								error: {
									code: -32000,
									message: "Transaction execution failed",
								},
							},
						});
					} catch (wcErr) {
						console.error(
							"Failed to respond to WalletConnect with error",
							wcErr,
						);
					}
				}

				setResult({
					isSubmitting: false,
					error: message,
				});
			}
		},
		[walletkit],
	);

	/**
	 * Clears the transaction result state.
	 * Useful for resetting the form after navigation or user action.
	 */
	const clearResult = useCallback(() => {
		setResult({ isSubmitting: false });
	}, []);

	return {
		...result,
		submitTransaction,
		clearResult,
	};
}
