import type { NonceGroup } from "@/lib/harbour";
import type { SafeConfiguration } from "@/lib/safe";
import { TransactionDetails } from "./TransactionDetails";

interface QueueTransactionItemProps {
	txWithSigs: NonceGroup["transactions"][number];
	nonce: string;
	safeConfig: SafeConfiguration;
	executingTxHash: string | null;
	executionSuccessTxHash: string | null;
	executionError: Error | null;
	isExecutionPending: boolean;
	signingTxHash: string | null;
	signSuccessTxHash: string | null;
	signError: string | null;
	handleExecuteTransaction: (tx: NonceGroup["transactions"][number]) => void;
	handleSignTransaction: (tx: NonceGroup["transactions"][number], nonce: string) => void;
}

export function QueueTransactionItem({
	txWithSigs,
	nonce,
	safeConfig,
	executingTxHash,
	executionSuccessTxHash,
	executionError,
	isExecutionPending,
	signingTxHash,
	signSuccessTxHash,
	signError,
	handleExecuteTransaction,
	handleSignTransaction,
}: QueueTransactionItemProps) {
	const canExecute = txWithSigs.signatures.length >= safeConfig.threshold;
	const isLoadingThisTx = isExecutionPending && executingTxHash === txWithSigs.safeTxHash;
	const errorForThisTx = executionError && executingTxHash === txWithSigs.safeTxHash;
	const successForThisTx = executionSuccessTxHash === txWithSigs.safeTxHash;

	return (
		<div className="p-5 border border-gray-200 rounded-lg bg-white shadow-sm mb-4">
			<h3 className="text-lg font-medium text-gray-900 mb-2">Transaction</h3>
			<p className="text-xs bg-gray-50 p-2 rounded font-mono break-all mb-3">SafeTxHash: {txWithSigs.safeTxHash}</p>
			<TransactionDetails details={txWithSigs.details} />
			<div className="mt-2">
				<h4 className="text-md font-medium text-gray-700">
					Signatures ({txWithSigs.signatures.length} / {safeConfig.threshold}):
				</h4>
				{txWithSigs.signatures.length === 0 && (
					<p className="text-xs text-gray-500">No signatures from known owners yet.</p>
				)}
				<ul className="list-disc list-inside pl-4 text-xs text-gray-600">
					{txWithSigs.signatures.map((sig) => (
						<li key={sig.signer + sig.r + sig.vs} className="break-all">
							Signer: {sig.signer} (r: {sig.r.substring(0, 10)}..., vs: {sig.vs.substring(0, 10)}...)
						</li>
					))}
				</ul>
			</div>
			<div className="mt-3">
				{canExecute && !successForThisTx && (
					<button
						type="button"
						onClick={() => handleExecuteTransaction(txWithSigs)}
						disabled={isLoadingThisTx || isExecutionPending}
						className="px-4 py-2 bg-gray-900 text-white rounded-md hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900 disabled:opacity-50 transition-colors"
					>
						{isLoadingThisTx ? "Processing..." : "Execute Transaction"}
					</button>
				)}
				{!canExecute && (
					<div className="space-y-2">
						<button
							type="button"
							onClick={() => handleSignTransaction(txWithSigs, nonce)}
							disabled={signingTxHash === txWithSigs.safeTxHash}
							className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 disabled:opacity-50 transition-colors"
						>
							{signingTxHash === txWithSigs.safeTxHash ? "Signing..." : "Sign Transaction"}
						</button>
						{signError && signingTxHash === txWithSigs.safeTxHash && (
							<div className="mt-2 bg-red-50 border-l-4 border-red-400 p-3">
								<p className="text-sm text-red-700">Signature failed: {signError}</p>
							</div>
						)}
						{signSuccessTxHash === txWithSigs.safeTxHash && (
							<div className="mt-2 bg-green-50 border-l-4 border-green-400 p-3">
								<p className="text-sm text-green-700">✓ Signature submitted!</p>
							</div>
						)}
						<p className="text-sm text-yellow-700 bg-yellow-50 px-3 py-2 rounded-md">
							<i className="mr-1">⚠️</i> Needs {safeConfig.threshold - txWithSigs.signatures.length} more signature
							{safeConfig.threshold - txWithSigs.signatures.length !== 1 ? "s" : ""} to execute.
						</p>
					</div>
				)}
				{isLoadingThisTx && (
					<div className="mt-2 text-sm text-gray-600 flex items-center">
						<svg
							className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-500"
							xmlns="http://www.w3.org/2000/svg"
							fill="none"
							viewBox="0 0 24 24"
							role="img"
							aria-label="Loading"
						>
							<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
							<path
								className="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
							/>
						</svg>
						Submitting transaction...
					</div>
				)}
				{errorForThisTx && (
					<div className="mt-2 bg-red-50 border-l-4 border-red-400 p-3">
						<p className="text-sm text-red-700">Execution failed: {executionError?.message}</p>
					</div>
				)}
				{successForThisTx && (
					<div className="mt-2 bg-green-50 border-l-4 border-green-400 p-3">
						<p className="text-sm text-green-700">
							✓ Transaction successfully submitted! Monitor your wallet for confirmation.
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
