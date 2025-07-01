import { type UseMutationResult, useMutation } from "@tanstack/react-query";
import type { JsonRpcApiProvider, TransactionResponse } from "ethers";
import { switchToChain } from "@/lib/chains";
import { executeTransaction } from "../lib/safe";
import type {
	ChainId,
	HarbourSignature,
	HarbourTransactionDetails,
} from "../lib/types";

/**
 * Represents the combined transaction details and signatures required for execution.
 * This is the type expected by the `executeTransaction` function.
 */
export type TransactionToExecute = HarbourTransactionDetails & {
	signatures: HarbourSignature[];
};

/**
 * Variables for the execute transaction mutation.
 */
interface ExecuteTransactionVariables {
	/** The transaction object to be executed. */
	transaction: TransactionToExecute;
}

interface UseExecuteTransactionProps {
	/** Ethers.js provider from the connected wallet. */
	provider: JsonRpcApiProvider;
	/** The address of the Safe contract where the transaction will be executed. */
	safeAddress: string;
	/** The chain ID of the Safe contract. */
	chainId: ChainId;
	/** Optional callback for successful transaction execution. */
	onSuccess?: (data: TransactionResponse) => void;
	/** Optional callback for errors during transaction execution. */
	onError?: (error: Error) => void;
}

/**
 * Custom React Query hook to execute a Safe transaction.
 * Handles chain switching and uses `useMutation` for the asynchronous operation.
 *
 * @param {UseExecuteTransactionProps} props - Configuration for the hook.
 * @returns {UseMutationResult<TransactionResponse, Error, ExecuteTransactionVariables>} The React Query mutation result object.
 */
export function useExecuteTransaction({
	provider,
	safeAddress,
	chainId,
	onSuccess,
	onError,
}: UseExecuteTransactionProps): UseMutationResult<
	TransactionResponse,
	Error,
	ExecuteTransactionVariables
> {
	return useMutation<TransactionResponse, Error, ExecuteTransactionVariables>({
		mutationFn: async ({ transaction }: ExecuteTransactionVariables) => {
			await switchToChain(provider, chainId);
			const signer = await provider.getSigner();

			return executeTransaction(signer, safeAddress, transaction);
		},
		onSuccess: (data) => {
			if (onSuccess) {
				onSuccess(data);
			}
			// Consider invalidating queries here, e.g., to refresh the transaction queue
			// import { useQueryClient } from "@tanstack/react-query";
			// const queryClient = useQueryClient();
			// queryClient.invalidateQueries({ queryKey: ['safeQueue', safeAddress] });
		},
		onError: (error: Error) => {
			if (onError) {
				onError(error);
			}
		},
	});
}
