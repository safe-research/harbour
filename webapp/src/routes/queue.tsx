import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import type { BrowserProvider, JsonRpcApiProvider } from "ethers";
import { PlusCircle } from "lucide-react";
import { useState } from "react";
import { switchToChain } from "@/lib/chains";
import type { ChainId } from "@/lib/types";

import { ActionCard } from "../components/ActionCard";
import { BackToDashboardButton } from "../components/BackButton";
import { QueueTransactionItem } from "../components/QueueTransactionItem";
import { RequireWallet, useWalletProvider } from "../components/RequireWallet";
import { useChainlistRpcProvider } from "../hooks/useChainlistRpcProvider";
import {
	type TransactionToExecute,
	useExecuteTransaction,
} from "../hooks/useExecuteTransaction";
import { useSafeConfiguration } from "../hooks/useSafeConfiguration";
import { useSafeQueue } from "../hooks/useSafeQueue";
import {
	enqueueSafeTransaction,
	HARBOUR_CHAIN_ID,
	type NonceGroup,
} from "../lib/harbour";
import type { SafeConfiguration } from "../lib/safe";
import { signSafeTransaction } from "../lib/safe";
import type { FullSafeTransaction } from "../lib/types";
import { safeIdSchema } from "../lib/validators";

// Define the route before the component so Route is in scope
/**
 * Route definition for the transaction queue page.
 * Validates search parameters (safe address, chainId).
 */
export const Route = createFileRoute("/queue")({
	validateSearch: zodValidator(safeIdSchema),
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
function QueueContent({
	walletProvider,
	harbourProvider,
	safeAddress,
	safeConfig,
	chainId,
}: QueueContentProps) {
	const {
		data: queue,
		isLoading: isLoadingQueue,
		error: queueError,
	} = useSafeQueue({
		provider: harbourProvider,
		safeAddress,
		safeConfig,
		safeChainId: chainId,
	});

	// State for managing execution feedback for a specific transaction
	const [executingTxHash, setExecutingTxHash] = useState<string | null>(null);
	const [executionSuccessTxHash, setExecutionSuccessTxHash] = useState<
		string | null
	>(null);
	const [executionError, setExecutionError] = useState<Error | null>(null);

	// State for managing signing feedback when not enough signatures
	const [signingTxHash, setSigningTxHash] = useState<string | null>(null);
	const [signSuccessTxHash, setSignSuccessTxHash] = useState<string | null>(
		null,
	);
	const [signError, setSignError] = useState<string | null>(null);

	const { mutate: execute, isPending: isExecutionPending } =
		useExecuteTransaction({
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

	const handleSignTransaction = async (
		txWithSigs: NonceGroup["transactions"][number],
		nonce: string,
	) => {
		setSigningTxHash(txWithSigs.safeTxHash);
		setSignSuccessTxHash(null);
		setSignError(null);
		try {
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
			await switchToChain(walletProvider, chainId);
			const signer = await walletProvider.getSigner();
			const signature = await signSafeTransaction(signer, fullTx);
			// Enqueue signature on Harbour chain
			await switchToChain(walletProvider, HARBOUR_CHAIN_ID);
			await enqueueSafeTransaction(signer, fullTx, signature);
			setSignSuccessTxHash(txWithSigs.safeTxHash);
		} catch (err) {
			const errMsg =
				err instanceof Error
					? err.message
					: "Unknown error when signing transaction";
			setSignError(errMsg);
			console.error(err);
		} finally {
			setSigningTxHash(null);
		}
	};

	const handleExecuteTransaction = (
		txWithSigs: NonceGroup["transactions"][number],
	) => {
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
					<h1 className="text-3xl font-bold text-gray-900 mt-4">
						Transaction Queue
					</h1>
					<p className="text-gray-700 mt-2">
						Safe:{" "}
						<span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
							{safeAddress}
						</span>
					</p>
				</div>

				{queueError && (
					<div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
						<p className="text-red-700">
							Error loading queue: {queueError.message}
						</p>
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
									No transactions found in the queue for the next 5 nonces from
									known signers.
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
						{queue.map((nonceGroup) => (
							<div
								key={nonceGroup.nonce}
								className="bg-white rounded-lg shadow-sm p-6 border border-gray-200 mb-6"
							>
								<h2 className="text-xl font-semibold text-gray-900 mb-4">
									Nonce: {nonceGroup.nonce}
								</h2>
								{nonceGroup.transactions.length === 0 ? (
									<p className="text-sm text-gray-500">
										No transactions for this nonce.
									</p>
								) : (
									<div className="space-y-4">
										{nonceGroup.transactions.map((txWithSigs) => (
											<QueueTransactionItem
												key={txWithSigs.safeTxHash}
												txWithSigs={txWithSigs}
												nonce={nonceGroup.nonce}
												safeConfig={safeConfig}
												executingTxHash={executingTxHash}
												executionSuccessTxHash={executionSuccessTxHash}
												executionError={executionError}
												isExecutionPending={isExecutionPending}
												signingTxHash={signingTxHash}
												signSuccessTxHash={signSuccessTxHash}
												signError={signError}
												handleExecuteTransaction={handleExecuteTransaction}
												handleSignTransaction={handleSignTransaction}
											/>
										))}
									</div>
								)}
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
	const {
		provider: rpcProvider,
		error: rpcError,
		isLoading: isLoadingRpc,
	} = useChainlistRpcProvider(Number(chainId));
	const {
		data: safeConfig,
		isLoading: isLoadingConfig,
		error: configError,
	} = useSafeConfiguration(rpcProvider, safeAddress);

	if (isLoadingRpc || isLoadingConfig || isLoadingHarbour) {
		return (
			<p className="text-center p-6 text-gray-600">
				Loading Safe configuration…
			</p>
		);
	}

	const error = harbourError || rpcError || configError;
	if (error) {
		return (
			<p className="text-center p-6 text-red-600">
				Error initializing RPC provider: {error.message}
			</p>
		);
	}

	if (!safeConfig || !harbourProvider) {
		return (
			<p className="text-center p-6 text-gray-600">
				Safe configuration not available.
			</p>
		);
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
