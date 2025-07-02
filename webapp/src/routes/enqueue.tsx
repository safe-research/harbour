import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import type { BrowserProvider, JsonRpcApiProvider } from "ethers";
import type { ReactNode } from "react";
import z from "zod";
import {
	ethereumAddressSchema,
	hexDataSchema,
	safeIdSchema,
} from "@/lib/validators";
import { BackToDashboardButton } from "../components/BackButton";
import { RequireWallet, useWalletProvider } from "../components/RequireWallet";
import { BatchTransactionForm } from "../components/transaction-forms/BatchTransactionForm";
import { ERC20TransferForm } from "../components/transaction-forms/ERC20TransferForm";
import { NativeTransferForm } from "../components/transaction-forms/NativeTransferForm";
import { RawTransactionForm } from "../components/transaction-forms/RawTransactionForm";
import { WalletConnectTransactionForm } from "../components/transaction-forms/WalletConnectTransactionForm";
import { useChainlistRpcProvider } from "../hooks/useChainlistRpcProvider";
import { useSafeConfiguration } from "../hooks/useSafeConfiguration";
import type { ChainId } from "../lib/types";

interface BaseEnqueueContentProps {
	browserProvider: BrowserProvider;
	rpcProvider: JsonRpcApiProvider;
	safeAddress: string;
	chainId: ChainId;
}

// Discriminated union based on flow type
type EnqueueContentProps =
	| (BaseEnqueueContentProps & { flow?: "native" })
	| (BaseEnqueueContentProps & { flow: "erc20"; tokenAddress?: string })
	| (BaseEnqueueContentProps & { flow?: "raw" })
	| (BaseEnqueueContentProps & { flow: "batch" })
	| (BaseEnqueueContentProps & {
			flow: "walletconnect";
			// Prefill fields for walletconnect flow
			txTo?: string;
			txValue?: string;
			txData?: string;
			wcApp: string;
			wcAppUrl?: string;
			wcAppIcon?: string;
			wcAppDescription?: string;
			topic: string;
			reqId: string;
	  });

export const walletConnectParamsSchema = z.object({
	txTo: ethereumAddressSchema.optional(),
	txValue: z.string().optional(),
	txData: hexDataSchema.optional(),
	wcApp: z.string().optional(),
	wcAppUrl: z.string().optional(),
	wcAppIcon: z.string().optional(),
	wcAppDescription: z.string().optional(),
	topic: z.string().optional(),
	reqId: z.string().optional(),
});

export type WalletConnectParams = z.infer<typeof walletConnectParamsSchema>;

/**
 * Content component for the enqueue transaction page.
 * Dynamically renders the correct form based on the 'flow' search parameter.
 */
function EnqueueContent(props: EnqueueContentProps) {
	const { browserProvider, rpcProvider, safeAddress, chainId, flow } = props;
	const {
		data: config, // Renamed from configResult to config for clarity
		isLoading: isLoadingConfig,
		error: configError,
	} = useSafeConfiguration(rpcProvider, safeAddress);

	let pageTitle = "Enqueue Transaction";

	switch (flow) {
		case "batch":
			pageTitle = "Enqueue Batched Transactions";
			break;
		case "native":
			pageTitle = "Enqueue Native ETH Transfer";
			break;
		case "erc20":
			pageTitle = "Enqueue ERC20 Token Transfer";
			break;
		case "walletconnect":
			pageTitle = "Enqueue WalletConnect Transaction";
			break;
		default:
			pageTitle = "Enqueue Raw Transaction";
			break;
	}

	let formComponent: ReactNode | null = null;
	if (config) {
		switch (flow) {
			case "batch":
				formComponent = (
					<BatchTransactionForm
						safeAddress={safeAddress}
						chainId={chainId}
						browserProvider={browserProvider}
						rpcProvider={rpcProvider}
						config={config}
					/>
				);
				break;
			case "erc20":
				formComponent = (
					<ERC20TransferForm
						safeAddress={safeAddress}
						chainId={chainId}
						browserProvider={browserProvider}
						rpcProvider={rpcProvider}
						config={config}
						tokenAddress={
							props.flow === "erc20" ? props.tokenAddress : undefined
						}
					/>
				);
				break;
			case "native":
				formComponent = (
					<NativeTransferForm
						safeAddress={safeAddress}
						chainId={chainId}
						browserProvider={browserProvider}
						rpcProvider={rpcProvider}
						config={config}
					/>
				);
				break;
			case "walletconnect":
				if (props.flow === "walletconnect") {
					formComponent = (
						<WalletConnectTransactionForm
							safeAddress={safeAddress}
							chainId={chainId}
							browserProvider={browserProvider}
							rpcProvider={rpcProvider}
							config={config}
							txTo={props.txTo}
							txData={props.txData}
							txValue={props.txValue}
							wcApp={props.wcApp}
							wcAppUrl={props.wcAppUrl}
							wcAppIcon={props.wcAppIcon}
							wcAppDescription={props.wcAppDescription}
							topic={props.topic}
							reqId={props.reqId}
						/>
					);
				}
				break;
			default:
				formComponent = (
					<RawTransactionForm
						safeAddress={safeAddress}
						chainId={chainId}
						browserProvider={browserProvider}
						rpcProvider={rpcProvider}
						config={config}
					/>
				);
		}
	}

	return (
		<div className="min-h-screen bg-gray-50">
			<div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8">
				<div className="mb-8">
					<BackToDashboardButton safeAddress={safeAddress} chainId={chainId} />
					<h1 className="text-3xl font-bold text-gray-900 mt-4">{pageTitle}</h1>
					<p className="text-gray-700 mt-2">
						Safe:{" "}
						<span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
							{safeAddress}
						</span>
					</p>
				</div>

				{configError && (
					<div className="bg-red-50 border-l-4 border-red-400 p-4 mb-6">
						<p className="text-red-700">
							Error loading Safe configuration: {configError.message}
						</p>
					</div>
				)}

				{isLoadingConfig ? (
					<div className="bg-white rounded-lg shadow-sm p-8 border border-gray-200">
						<div className="animate-pulse space-y-4">
							<div className="h-4 bg-gray-200 rounded w-1/4" />{" "}
							{/* Simulates title area */}
							<div className="h-10 bg-gray-200 rounded w-3/4" />{" "}
							{/* Simulates an input field */}
							<div className="h-10 bg-gray-200 rounded w-full" />{" "}
							{/* Simulates another input field */}
						</div>
						<p className="text-center mt-4 text-gray-600">
							Loading Safe configuration...
						</p>
					</div>
				) : (
					formComponent
				)}
			</div>
		</div>
	);
}

// Added new "walletconnect" flow to support WalletConnect transaction requests
const flowSchema = z
	.enum(["native", "erc20", "raw", "batch", "walletconnect"])
	.optional()
	.default("raw");

// Additional optional params used to pre-populate forms when the walletconnect flow is chosen.
const enqueueSchema = safeIdSchema.extend({
	flow: flowSchema,
	tokenAddress: z.string().optional(),
	// WalletConnect-specific search params
	txTo: z.string().optional(),
	txValue: z.string().optional(),
	txData: z.string().optional(),
	wcApp: z.string().optional(),
	wcAppUrl: z.string().optional(),
	wcAppIcon: z.string().optional(),
	wcAppDescription: z.string().optional(),
	// WalletConnect request identifiers
	topic: z.string().optional(),
	reqId: z.string().optional(),
});

/**
 * Route definition for the enqueue transaction page.
 * Validates search parameters (safe address, chainId, and optional flow).
 */
export const Route = createFileRoute("/enqueue")({
	validateSearch: zodValidator(enqueueSchema),
	component: EnqueuePage,
});

/**
 * Page component for enqueueing a new Safe transaction.
 * Retrieves validated search params (including flow) and wraps content with wallet and provider requirements.
 */
export function EnqueuePage() {
	const searchParams = Route.useSearch();

	// Extract WalletConnect-specific params
	const walletConnectParams: WalletConnectParams = {
		txTo: searchParams.txTo,
		txValue: searchParams.txValue,
		txData: searchParams.txData,
		wcApp: searchParams.wcApp,
		wcAppUrl: searchParams.wcAppUrl,
		wcAppIcon: searchParams.wcAppIcon,
		wcAppDescription: searchParams.wcAppDescription,
		topic: searchParams.topic,
		reqId: searchParams.reqId,
	};

	return (
		<RequireWallet>
			<EnqueuePageInner
				safeAddress={searchParams.safe}
				chainId={searchParams.chainId}
				flow={searchParams.flow}
				tokenAddress={searchParams.tokenAddress}
				walletConnectParams={walletConnectParams}
			/>
		</RequireWallet>
	);
}

type TransactionFlowType = z.infer<typeof flowSchema>;

interface EnqueuePageInnerProps {
	safeAddress: string;
	chainId: ChainId;
	flow?: TransactionFlowType;
	tokenAddress?: string;
	walletConnectParams: WalletConnectParams;
}
/**
 * Inner component for the enqueue page, rendered if wallet and providers are ready.
 */
function EnqueuePageInner({
	safeAddress,
	chainId,
	flow,
	tokenAddress,
	walletConnectParams,
}: EnqueuePageInnerProps) {
	const browserProvider = useWalletProvider();
	const {
		provider: rpcProvider,
		error: rpcError,
		isLoading: isLoadingRpc,
	} = useChainlistRpcProvider(chainId);

	if (rpcError) {
		return (
			<p className="text-center p-6 text-red-600">
				Error initializing RPC provider: {rpcError.message}
			</p>
		);
	}
	if (isLoadingRpc || !rpcProvider) {
		// Added a more specific loading message for the provider
		return (
			<p className="text-center p-6 text-gray-600">
				Initializing RPC provider for chain {String(chainId)}...
			</p>
		);
	}

	if (flow === "walletconnect") {
		if (
			!walletConnectParams.wcApp ||
			!walletConnectParams.topic ||
			!walletConnectParams.reqId
		) {
			return (
				<p className="text-center p-6 text-red-600">
					Missing required WalletConnect parameters
				</p>
			);
		}
		return (
			<EnqueueContent
				browserProvider={browserProvider}
				rpcProvider={rpcProvider}
				safeAddress={safeAddress}
				chainId={chainId}
				flow="walletconnect"
				txTo={walletConnectParams.txTo}
				txValue={walletConnectParams.txValue}
				txData={walletConnectParams.txData}
				wcApp={walletConnectParams.wcApp}
				wcAppUrl={walletConnectParams.wcAppUrl}
				wcAppIcon={walletConnectParams.wcAppIcon}
				wcAppDescription={walletConnectParams.wcAppDescription}
				topic={walletConnectParams.topic}
				reqId={walletConnectParams.reqId}
			/>
		);
	}

	if (flow === "erc20") {
		return (
			<EnqueueContent
				browserProvider={browserProvider}
				rpcProvider={rpcProvider}
				safeAddress={safeAddress}
				chainId={chainId}
				flow="erc20"
				tokenAddress={tokenAddress}
			/>
		);
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
