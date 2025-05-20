import { BackButton } from "@/components/BackButton";
import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import type { JsonRpcApiProvider } from "ethers";

import { PlusCircle, ScrollText } from "lucide-react";

import { z } from "zod";
import ActionCard from "../components/ActionCard";
import { RequireWallet } from "../components/RequireWallet";
import SafeConfigDisplay from "../components/SafeConfigDisplay";
import { useSafeConfiguration } from "../hooks/useSafeConfiguration";
import { useChainlistRpcProvider } from "../hooks/useChainlistRpcProvider";

import { safeAddressSchema } from "../lib/validators";

interface DashboardContentProps {
	provider: JsonRpcApiProvider;
	safeAddress: string;
	chainId: number;
}

function DashboardContent({ provider, safeAddress, chainId }: DashboardContentProps) {
	const { data: config, isLoading, error } = useSafeConfiguration(provider, safeAddress);

	return (
		<div className="min-h-screen bg-gray-50">
			<div className="max-w-5xl mx-auto p-6 space-y-8">
				<div>
					<BackButton to="/">Back to home</BackButton>
					<h1 className="text-3xl font-bold text-gray-900">Safe Dashboard</h1>
					<p className="text-gray-600">Manage your Safe and execute transactions</p>
				</div>

				{isLoading && <p className="text-gray-600">Loading configuration…</p>}
				{error && <p className="text-red-600">Error: {error.message}</p>}

				{config && (
					<>
						<div className="grid md:grid-cols-2 gap-6">
							<ActionCard
								title="Transaction Queue"
								description="View and execute pending transactions that are ready to be executed."
								icon={ScrollText}
								ctaText="View Queue"
								to="/queue"
								search={{ safe: safeAddress, chainId }}
							/>
							<ActionCard
								title="New Transaction"
								description="Create and enqueue a new transaction for your Safe."
								icon={PlusCircle}
								ctaText="Create Transaction"
								to="/enqueue"
								search={{ safe: safeAddress, chainId }}
							/>
						</div>

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

const configSearchSchema = z.object({
	safe: safeAddressSchema,
	chainId: z.number().gt(0),
});

export const Route = createFileRoute("/dashboard")({
	validateSearch: zodValidator(configSearchSchema),
	component: DashboardPage,
});

export function DashboardPage() {
	const { safe: safeAddress, chainId } = Route.useSearch();
	return (
		<RequireWallet>
			<DashboardPageInner safeAddress={safeAddress} chainId={chainId} />
		</RequireWallet>
	);
}

function DashboardPageInner({ safeAddress, chainId }: { safeAddress: string; chainId: number }) {
	const { provider, error, isLoading } = useChainlistRpcProvider(chainId);

	if (error) return <p className="text-red-600">Error: {error.message}</p>;
	if (isLoading || !provider) return <p className="text-gray-600">Initializing provider…</p>;
	return <DashboardContent provider={provider} safeAddress={safeAddress} chainId={chainId} />;
}
