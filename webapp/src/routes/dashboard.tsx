import { BackButton } from "@/components/BackButton";
import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import type { JsonRpcApiProvider } from "ethers";
import { ArrowRightLeft, Coins, FileCode, ScrollText } from "lucide-react"; // Added ArrowRightLeft, Coins, FileCode. PlusCircle removed as FileCode is used.

import ActionCard from "../components/ActionCard";
import { RequireWallet } from "../components/RequireWallet";
import SafeConfigDisplay from "../components/SafeConfigDisplay";
import BalancesSection from "../components/BalancesSection";
import { useChainlistRpcProvider } from "../hooks/useChainlistRpcProvider";
import { useSafeConfiguration } from "../hooks/useSafeConfiguration";

import { configSearchSchema } from "../lib/validators";

interface DashboardContentProps {
	/** Ethers JSON RPC API provider instance. */
	provider: JsonRpcApiProvider;
	/** The address of the Safe. */
	safeAddress: string;
	/** The chain ID where the Safe is deployed. */
	chainId: number;
}

/**
 * Displays the main content of the Safe dashboard, including actions and configuration.
 * @param {DashboardContentProps} props - The component props.
 * @returns JSX element representing the dashboard content.
 */
function DashboardContent({ provider, safeAddress, chainId }: DashboardContentProps) {
	const { data: config, isLoading: isLoadingConfig, error: errorConfig } = useSafeConfiguration(provider, safeAddress);

	return (
		<div className="min-h-screen bg-gray-50">
			<div className="max-w-5xl mx-auto p-6 space-y-8">
				<div>
					<BackButton to="/">Back to home</BackButton>
					<h1 className="text-3xl font-bold text-gray-900">Safe Dashboard</h1>
					<p className="text-gray-600">Manage your Safe and execute transactions</p>
				</div>

				{isLoadingConfig && <p className="text-gray-600">Loading configuration…</p>}
				{errorConfig && <p className="text-red-600">Error: {errorConfig.message}</p>}

				{config && (
					<>
						<div className="grid md:grid-cols-2 gap-6">
							<ActionCard
								title="Transaction Queue"
								description="View and execute pending transactions that are ready to be executed."
								icon={ScrollText} // Kept ScrollText
								ctaText="View Queue"
								to="/queue"
								search={{ safe: safeAddress, chainId }}
							/>
							<ActionCard
								title="New Raw Transaction"
								description="Define all transaction parameters manually for full control."
								icon={FileCode} // Changed icon
								ctaText="Create Raw Tx"
								to="/enqueue"
								search={{ safe: safeAddress, chainId, flow: "raw" }} // Added flow: "raw"
							/>
							<ActionCard
								title="New ETH Transfer"
								description="Send native currency (e.g., ETH) from your Safe."
								icon={ArrowRightLeft} // New icon
								ctaText="Send ETH"
								to="/enqueue"
								search={{ safe: safeAddress, chainId, flow: "native" }}
							/>
							<ActionCard
								title="New ERC20 Transfer"
								description="Send ERC20 tokens (e.g., USDC, DAI) from your Safe."
								icon={Coins} // New icon
								ctaText="Send Token"
								to="/enqueue"
								search={{ safe: safeAddress, chainId, flow: "erc20" }}
							/>
						</div>

						<BalancesSection provider={provider} safeAddress={safeAddress} chainId={chainId} />

						<div className="mt-10">
							<h2 className="text-xl font-semibold text-gray-900 mb-4">Safe Configuration</h2>
							<div className="bg-white p-6 border border-gray-200 rounded-lg">
								<SafeConfigDisplay config={config} />
							</div>
						</div>
					</>
				)}
			</div>
		</div>
	);
}

/**
 * Page component for the Safe dashboard.
 * It retrieves validated search parameters (Safe address and chain ID)
 * and wraps the main content with a wallet requirement check.
 * @returns JSX element for the dashboard page.
 */
export const Route = createFileRoute("/dashboard")({
	validateSearch: zodValidator(configSearchSchema),
	component: DashboardPage,
});

/**
 * Page component for the Safe dashboard.
 * It retrieves validated search parameters (Safe address and chain ID)
 * and wraps the main content with a wallet requirement check.
 * @returns JSX element for the dashboard page.
 */
export function DashboardPage() {
	const { safe: safeAddress, chainId } = Route.useSearch();
	return (
		<RequireWallet>
			<DashboardPageInner safeAddress={safeAddress} chainId={chainId} />
		</RequireWallet>
	);
}

/**
 * Inner component for the dashboard page, rendered if a wallet is connected.
 * It acquires a JSON RPC provider for the given chain ID and then renders the main dashboard content.
 * @param {{ safeAddress: string; chainId: number }} props - Props containing the Safe address and chain ID.
 * @returns JSX element, either a loading/error state or the DashboardContent.
 */
function DashboardPageInner({
	safeAddress,
	chainId,
}: {
	safeAddress: string;
	chainId: number;
}) {
	const { provider, error, isLoading } = useChainlistRpcProvider(chainId);

	if (error) return <p className="text-red-600">Error: {error.message}</p>;
	if (isLoading || !provider) return <p className="text-gray-600">Initializing provider…</p>;
	return <DashboardContent provider={provider} safeAddress={safeAddress} chainId={chainId} />;
}
