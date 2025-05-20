import { useMutation } from "@tanstack/react-query";
import type { BrowserProvider, TransactionResponse } from "ethers";
import { executeTransaction } from "../lib/safe";
import type { ChainId, HarbourSignature, HarbourTransactionDetails } from "../lib/types";
import { switchToChain } from "@/lib/chains";

// This type combines the details and signatures, as expected by executeTransaction
export type TransactionToExecute = HarbourTransactionDetails & { signatures: HarbourSignature[] };

interface ExecuteTransactionVariables {
	transaction: TransactionToExecute;
}

interface UseExecuteTransactionProps {
	provider: BrowserProvider;
	safeAddress: string;
	chainId: ChainId;
	onSuccess?: (data: TransactionResponse) => void;
	onError?: (error: Error) => void;
}

export function useExecuteTransaction({ provider, safeAddress, chainId, onSuccess, onError }: UseExecuteTransactionProps) {
	return useMutation<TransactionResponse, Error, ExecuteTransactionVariables>({
		mutationFn: async ({ transaction }: ExecuteTransactionVariables) => {

			await switchToChain({request: async ({method, params}) => provider.send(method, params || [])}, chainId);
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
