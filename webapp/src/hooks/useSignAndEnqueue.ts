import { useNavigate } from "@tanstack/react-router";
import { type BrowserProvider, ethers } from "ethers";
import { useCallback, useState } from "react";
import { useWaku } from "@/contexts/WakuContext";
import {
	type EncryptedQueueParams,
	signAndEnqueueSafeTransaction,
} from "@/lib/harbour";
import { getSafeTransaction, type SafeConfiguration } from "@/lib/safe";
import type { ChainId, SafeTransaction } from "@/lib/types";

interface SignAndEnqueueProps<T> {
	/** The address of the Safe contract. */
	safeAddress: string;
	/** The chain ID where the Safe contract is deployed. */
	chainId: ChainId;
	/** An Ethers BrowserProvider instance from the connected wallet. */
	browserProvider: BrowserProvider;
	/** The configuration of the Safe, including the current nonce. */
	config: SafeConfiguration;
	/** The encrypted queue paramters. */
	encryptedQueue: EncryptedQueueParams | null;

	parser: (input: T) => SafeTransactionInput;
	onEnqueued?: () => void;
}

export type SafeTransactionInput = Partial<SafeTransaction> & {
	to: string;
	nonce: string | bigint;
};

interface SignAndEnqueueReturn<T> {
	isSubmitting: boolean;
	txHash: string | undefined;
	error: string | undefined;
	signAndEnqueue: (data: T) => void;
}

export function useSignAndEnqueue<T = SafeTransactionInput>({
	safeAddress,
	chainId,
	browserProvider,
	config,
	encryptedQueue,
	parser,
	onEnqueued,
}: SignAndEnqueueProps<T>): SignAndEnqueueReturn<T> {
	const waku = useWaku();
	const navigate = useNavigate();
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [txHash, setTxHash] = useState<string>();
	const [error, setError] = useState<string>();

	const signAndEnqueue = useCallback(
		async (input: T) => {
			setError(undefined);
			setTxHash(undefined);

			try {
				setIsSubmitting(true);

				const data = parser(input);

				const currentNonce =
					data.nonce === "" ? BigInt(config.nonce) : BigInt(data.nonce);

				const transaction = getSafeTransaction({
					chainId,
					safeAddress,
					to: data.to,
					value: ethers.parseEther(data.value || "0").toString(),
					data: data.data || "0x",
					nonce: currentNonce.toString(),
				});

				const receipt = await signAndEnqueueSafeTransaction(
					browserProvider,
					transaction,
					waku,
					encryptedQueue,
				);

				onEnqueued?.();

				setTxHash(receipt.transactionHash);
				navigate({ to: "/queue", search: { safe: safeAddress, chainId } });
			} catch (err: unknown) {
				const message =
					err instanceof Error ? err.message : "Transaction failed";
				setError(message);
			} finally {
				setIsSubmitting(false);
			}
		},
		[
			waku,
			navigate,
			onEnqueued,
			parser,
			safeAddress,
			chainId,
			browserProvider,
			config,
			encryptedQueue,
		],
	);
	return {
		isSubmitting,
		txHash,
		error,
		signAndEnqueue,
	};
}
