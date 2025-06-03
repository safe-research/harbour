import type { CommonTransactionFormProps } from "@/components/transaction-forms/types";
import { configSearchSchema } from "@/lib/validators";
import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import type { BrowserProvider, JsonRpcApiProvider } from "ethers";
import z from "zod";
import { BackToDashboardButton } from "../components/BackButton";
import { RequireWallet, useWalletProvider } from "../components/RequireWallet";
import { ERC20TransferForm } from "../components/transaction-forms/ERC20TransferForm";
import { NativeTransferForm } from "../components/transaction-forms/NativeTransferForm";
import { RawTransactionForm } from "../components/transaction-forms/RawTransactionForm";
import { useChainlistRpcProvider } from "../hooks/useChainlistRpcProvider";
import { useSafeConfiguration } from "../hooks/useSafeConfiguration";
import type { ChainId } from "../lib/types";

interface EnqueueContentProps {
	browserProvider: BrowserProvider;
	rpcProvider: JsonRpcApiProvider;
	safeAddress: string;
	chainId: ChainId;
	flow?: "native" | "erc20" | "raw";
}

/**
 * Content component for the enqueue transaction page.
 * Dynamically renders the correct form based on the 'flow' search parameter.
 */
function EnqueueContent({ browserProvider, rpcProvider, safeAddress, chainId, flow }: EnqueueContentProps) {
	const {
		data: config, // Renamed from configResult to config for clarity
		isLoading: isLoadingConfig,
		error: configError,
	} = useSafeConfiguration(rpcProvider, safeAddress);

	let FormComponent: React.ComponentType<CommonTransactionFormProps>;
	let pageTitle = "Enqueue Transaction";

	switch (flow) {
		case "native":
			FormComponent = NativeTransferForm;
			pageTitle = "Enqueue Native ETH Transfer";
			break;
		case "erc20":
			FormComponent = ERC20TransferForm;
			pageTitle = "Enqueue ERC20 Token Transfer";
			break;
		default:
			FormComponent = RawTransactionForm;
			pageTitle = "Enqueue Raw Transaction";
			break;
	}

	return (
		<div className="min-h-screen bg-gray-50">
			<div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
				<div className="mb-8">
					<BackToDashboardButton safeAddress={safeAddress} chainId={chainId} />
					<h1 className="text-3xl font-bold text-gray-900 mt-4">{pageTitle}</h1>
					<p className="text-gray-700 mt-2">
						Safe: <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">{safeAddress}</span>
					</p>
				</div>

				{configError && (
					<div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
						<p className="text-red-700">Error loading Safe configuration: {configError.message}</p>
					</div>
				)}

				{isLoadingConfig ? (
					<div className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
						<div className="animate-pulse space-y-4">
							<div className="h-4 bg-gray-200 rounded w-1/4" /> {/* Simulates title area */}
							<div className="h-10 bg-gray-200 rounded w-3/4" /> {/* Simulates an input field */}
							<div className="h-10 bg-gray-200 rounded w-full" /> {/* Simulates another input field */}
						</div>
						<p className="text-center mt-4 text-gray-600">Loading Safe configuration...</p>
					</div>
				) : (
					config && (
						<FormComponent
							safeAddress={safeAddress}
							chainId={chainId}
							browserProvider={browserProvider}
							rpcProvider={rpcProvider}
							config={config}
						/>
					)
				)}
			</div>
		</div>
	);
}

const flowSchema = z.enum(["native", "erc20", "raw"]).optional().default("raw");
const enqueueSchema = configSearchSchema.extend({
	flow: flowSchema,
});

/**
 * Route definition for the enqueue transaction page.
 * Validates search parameters (safe address, chainId, and optional flow).
 */
export const Route = createFileRoute("/enqueue")({
	validateSearch: zodValidator(enqueueSchema), // configSearchSchema now includes 'flow'
	component: EnqueuePage,
});

/**
 * Page component for enqueueing a new Safe transaction.
 * Retrieves validated search params (including flow) and wraps content with wallet and provider requirements.
 */
export function EnqueuePage() {
	const { safe: safeAddress, chainId, flow } = Route.useSearch();
	return (
		<RequireWallet>
			<EnqueuePageInner safeAddress={safeAddress} chainId={Number(chainId)} flow={flow} />
		</RequireWallet>
	);
}

type TransactionFlow = z.infer<typeof flowSchema>;

interface EnqueuePageInnerProps {
	safeAddress: string;
	chainId: ChainId;
	flow?: TransactionFlow;
}
/**
 * Inner component for the enqueue page, rendered if wallet and providers are ready.
 */
function EnqueuePageInner({ safeAddress, chainId, flow }: EnqueuePageInnerProps) {
	const browserProvider = useWalletProvider();
	const { provider: rpcProvider, error: rpcError, isLoading: isLoadingRpc } = useChainlistRpcProvider(chainId);

	if (rpcError) {
		return <p className="text-center p-6 text-red-600">Error initializing RPC provider: {rpcError.message}</p>;
	}
	if (isLoadingRpc || !rpcProvider) {
		// Added a more specific loading message for the provider
		return <p className="text-center p-6 text-gray-600">Initializing RPC provider for chain {String(chainId)}...</p>;
	}

	return (
		<EnqueueContent
			browserProvider={browserProvider}
			rpcProvider={rpcProvider}
			safeAddress={safeAddress}
			chainId={chainId}
			flow={flow}
		/>
	);
}
