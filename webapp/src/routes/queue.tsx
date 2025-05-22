import { switchToChain } from "@/lib/chains";
import type { ChainId } from "@/lib/types";
import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import type { BrowserProvider, JsonRpcApiProvider } from "ethers";
import { PlusCircle } from "lucide-react";
import { useState } from "react";

import ActionCard from "../components/ActionCard";
import { BackToDashboardButton } from "../components/BackButton";
import { RequireWallet, useWalletProvider } from "../components/RequireWallet";
import { useChainlistRpcProvider } from "../hooks/useChainlistRpcProvider";
import { type TransactionToExecute, useExecuteTransaction } from "../hooks/useExecuteTransaction";
import { useSafeConfiguration } from "../hooks/useSafeConfiguration";
import { useSafeQueue } from "../hooks/useSafeQueue";
import { HARBOUR_CHAIN_ID, type NonceGroup, enqueueSafeTransaction } from "../lib/harbour";
import { signSafeTransaction } from "../lib/safe";
import type { SafeConfiguration } from "../lib/safe";
import type { FullSafeTransaction } from "../lib/types";
import { configSearchSchema } from "../lib/validators";

// Define the route before the component so Route is in scope
/**
 * Route definition for the transaction queue page.
 * Validates search parameters (safe address, chainId).
 */
export const Route = createFileRoute("/queue")({
	validateSearch: zodValidator(configSearchSchema),
	component: QueuePage,
});

/**
 * Props for the QueueContent component.
 */
interface QueueContentProps {
	/** Ethers BrowserProvider from the connected wallet. */
	walletProvider: BrowserProvider;
	/** Ethers JsonRpcApiProvider for the Harbour chain. */
	harbourProvider: JsonRpcApiProvider;
	/** The address of the Safe contract. */
	safeAddress: string;
	/** The configuration of the Safe contract. */
	safeConfig: SafeConfiguration;
	/** The chain ID of the Safe contract. */
	chainId: ChainId;
}

/**
 * Main content for the transaction queue page.
 * Displays transactions grouped by nonce, allowing users to sign or execute them.
 * @param {QueueContentProps} props - The component props.
 */
function QueueContent({ walletProvider, harbourProvider, safeAddress, safeConfig, chainId }: QueueContentProps) {
	const {
		data: queue,
		isLoading: isLoadingQueue,
		error: queueError,
	} = useSafeQueue({ provider: harbourProvider, safeAddress, safeConfig, safeChainId: chainId });

	// State for managing execution feedback for a specific transaction
	const [executingTxHash, setExecutingTxHash] = useState<string | null>(null);
	const [executionSuccessTxHash, setExecutionSuccessTxHash] = useState<string | null>(null);
	const [executionError, setExecutionError] = useState<Error | null>(null);

	// State for managing signing feedback when not enough signatures
	const [signingTxHash, setSigningTxHash] = useState<string | null>(null);
	const [signSuccessTxHash, setSignSuccessTxHash] = useState<string | null>(null);
	const [signError, setSignError] = useState<string | null>(null);

	const { mutate: execute, isPending: isExecutionPending } = useExecuteTransaction({
		provider: walletProvider,
		safeAddress,
		chainId,
		onSuccess: (data) => {
			console.log("Transaction executed successfully:", data);
			setExecutionSuccessTxHash(executingTxHash);
			setExecutingTxHash(null);
			setExecutionError(null);
		},
		onError: (err) => {
			console.error("Transaction execution failed:", err);
			setExecutionError(err);
			setExecutingTxHash(null);
		},
	});

	// Handler to sign a pending Safe transaction and enqueue signature
	const handleSignTransaction = async (txWithSigs: NonceGroup["transactions"][number], nonce: string) => {
		setSigningTxHash(txWithSigs.safeTxHash);
		setSignSuccessTxHash(null);
		setSignError(null);
		try {
			// Build full transaction object for signing
			const fullTx: FullSafeTransaction = {
				to: txWithSigs.details.to,
				value: txWithSigs.details.value,
				data: txWithSigs.details.data,
				operation: txWithSigs.details.operation,
				safeTxGas: txWithSigs.details.safeTxGas,
				baseGas: txWithSigs.details.baseGas,
				gasPrice: txWithSigs.details.gasPrice,
				gasToken: txWithSigs.details.gasToken,
				refundReceiver: txWithSigs.details.refundReceiver,
				nonce,
				safeAddress,
				chainId,
			};
			// Sign with EIP-712 on the Safe chain
			await switchToChain(
				{ request: async ({ method, params }) => walletProvider.send(method, params || []) },
				chainId,
			);
			const signer = await walletProvider.getSigner();
			const signature = await signSafeTransaction(signer, fullTx);
			// Enqueue signature on Harbour chain
			await switchToChain(
				{ request: async ({ method, params }) => walletProvider.send(method, params || []) },
				HARBOUR_CHAIN_ID,
			);
			await enqueueSafeTransaction(signer, fullTx, signature);
			setSignSuccessTxHash(txWithSigs.safeTxHash);
		} catch (err) {
			const errMsg = err instanceof Error ? err.message : "Unknown error when signing transaction";
			setSignError(errMsg);
			console.error(err);
		} finally {
			setSigningTxHash(null);
		}
	};

	const handleExecuteTransaction = (txWithSigs: NonceGroup["transactions"][number]) => {
		const transactionToExecute: TransactionToExecute = {
			...txWithSigs.details,
			signatures: txWithSigs.signatures,
		};
		setExecutingTxHash(txWithSigs.safeTxHash);
		setExecutionSuccessTxHash(null);
		setExecutionError(null);
		execute({ transaction: transactionToExecute });
	};

	return (
		<div className="min-h-screen bg-gray-50">
			<div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
				<div className="mb-8">
					<BackToDashboardButton safeAddress={safeAddress} chainId={chainId} />
					<h1 className="text-3xl font-bold text-gray-900 mt-4">Transaction Queue</h1>
					<p className="text-gray-700 mt-2">
						Safe: <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">{safeAddress}</span>
					</p>
				</div>

				{queueError && (
					<div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
						<p className="text-red-700">Error loading queue: {queueError.message}</p>
					</div>
				)}
				{isLoadingQueue && (
					<div className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
						<div className="animate-pulse space-y-4">
							<div className="h-4 bg-gray-200 rounded w-1/4" />
							<div className="h-10 bg-gray-200 rounded w-3/4" />
						</div>
					</div>
				)}

				{!isLoadingQueue && !queueError && queue && (
					<div className="space-y-8">
						{queue.length === 0 && (
							<div className="space-y-4">
								<p className="text-gray-600">
									No transactions found in the queue for the next 5 nonces from known signers.
								</p>
								<ActionCard
									title="New Transaction"
									description="Create and enqueue a new transaction for your Safe."
									icon={PlusCircle}
									ctaText="Create Transaction"
									to="/enqueue"
									search={{ safe: safeAddress, chainId }}
								/>
							</div>
						)}
						{queue.map((nonceGroup: NonceGroup) => (
							<div
								key={nonceGroup.nonce.toString()}
								className="bg-white rounded-lg shadow-sm p-6 border border-gray-200 mb-6"
							>
								<h2 className="text-xl font-semibold text-gray-900 mb-4">Nonce: {nonceGroup.nonce.toString()}</h2>
								{nonceGroup.transactions.length === 0 && (
									<p className="text-sm text-gray-500">No transactions for this nonce.</p>
								)}
								<div className="space-y-4">
									{nonceGroup.transactions.map((txWithSigs) => {
										const canExecute = txWithSigs.signatures.length >= Number.parseInt(safeConfig.threshold);
										const isLoadingThisTx = isExecutionPending && executingTxHash === txWithSigs.safeTxHash;
										const errorForThisTx = executionError && executingTxHash === txWithSigs.safeTxHash;
										const successForThisTx = executionSuccessTxHash === txWithSigs.safeTxHash;

										return (
											<div
												key={txWithSigs.safeTxHash}
												className="p-5 border border-gray-200 rounded-lg bg-white shadow-sm mb-4"
											>
												<h3 className="text-lg font-medium text-gray-900 mb-2">Transaction</h3>
												<p className="text-xs bg-gray-50 p-2 rounded font-mono break-all mb-3">
													TxHash: {txWithSigs.safeTxHash}
												</p>
												<div className="text-sm text-gray-700 space-y-1">
													<p>
														<strong>To:</strong> {txWithSigs.details.to}
													</p>
													<p>
														<strong>Value:</strong> {txWithSigs.details.value} wei
													</p>
													<p>
														<strong>Data:</strong>{" "}
														{txWithSigs.details.data === "0x" || txWithSigs.details.data === ""
															? "0x (No data)"
															: txWithSigs.details.data}
													</p>
													<p>
														<strong>Operation:</strong> {txWithSigs.details.operation === 0 ? "CALL" : "DELEGATECALL"}
													</p>
												</div>
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
																onClick={() => handleSignTransaction(txWithSigs, nonceGroup.nonce.toString())}
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
																<i className="mr-1">⚠️</i> Needs{" "}
																{Number.parseInt(safeConfig.threshold) - txWithSigs.signatures.length} more signature
																{Number.parseInt(safeConfig.threshold) - txWithSigs.signatures.length !== 1 ? "s" : ""}{" "}
																to execute.
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
									})}
								</div>
							</div>
						))}
					</div>
				)}
			</div>
		</div>
	);
}

export function QueuePage() {
	const { safe: safeAddress, chainId } = Route.useSearch();
	return (
		<RequireWallet>
			<QueuePageInner safeAddress={safeAddress} chainId={chainId} />
		</RequireWallet>
	);
}

/**
 * Inner component for the queue page, rendered if a wallet is connected.
 * Handles fetching of provider for the Safe's chain and the Harbour chain, and Safe configuration.
 * @param {{ safeAddress: string; chainId: ChainId }} props - Props containing Safe address and chain ID.
 * @returns JSX element for the queue page content or loading/error states.
 */
function QueuePageInner({
	safeAddress,
	chainId,
}: {
	safeAddress: string;
	chainId: ChainId;
}) {
	const browserProvider = useWalletProvider();
	const {
		provider: harbourProvider,
		error: harbourError,
		isLoading: isLoadingHarbour,
	} = useChainlistRpcProvider(HARBOUR_CHAIN_ID);
	const { provider: rpcProvider, error: rpcError, isLoading: isLoadingRpc } = useChainlistRpcProvider(Number(chainId));
	const {
		data: safeConfig,
		isLoading: isLoadingConfig,
		error: configError,
	} = useSafeConfiguration(rpcProvider, safeAddress);

	if (isLoadingRpc || isLoadingConfig || isLoadingHarbour) {
		return <p className="text-center p-6 text-gray-600">Loading Safe configuration…</p>;
	}

	const error = harbourError || rpcError || configError;
	if (error) {
		return <p className="text-center p-6 text-red-600">Error initializing RPC provider: {error.message}</p>;
	}

	if (!safeConfig || !harbourProvider) {
		return <p className="text-center p-6 text-gray-600">Safe configuration not available.</p>;
	}

	return (
		<QueueContent
			harbourProvider={harbourProvider}
			walletProvider={browserProvider}
			safeAddress={safeAddress}
			safeConfig={safeConfig}
			chainId={chainId}
		/>
	);
}
