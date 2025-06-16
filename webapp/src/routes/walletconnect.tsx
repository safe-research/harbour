import { safeIdSchema } from "@/lib/validators";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { useState } from "react";
import { RequireWallet } from "../components/RequireWallet";
import type { ChainId } from "../lib/types";
import { useRegisterSafeContext, useWalletConnect } from "../providers/WalletConnectProvider";

interface WalletConnectContentProps {
	safeAddress: string;
	chainId: ChainId;
}

function WalletConnectContent({ safeAddress, chainId }: WalletConnectContentProps) {
	const { pair, sessions, error } = useWalletConnect();
	const [uriInput, setUriInput] = useState("");
	const navigate = useNavigate();

	// Let WalletKit know which Safe we are exposing
	useRegisterSafeContext(safeAddress, chainId);

	const handlePair = async () => {
		if (!uriInput.trim()) return;
		await pair(uriInput.trim());
		setUriInput("");
	};

	const sessionEntries = Object.values(sessions ?? {});

	return (
		<div className="min-h-screen bg-gray-50">
			<div className="max-w-3xl mx-auto px-4 py-12 sm:px-6 lg:px-8 space-y-8">
				<div>
					<button
						type="button"
						onClick={() => navigate({ to: "/dashboard", search: { safe: safeAddress, chainId } })}
						className="text-sm text-gray-600 hover:underline"
					>
						← Back to dashboard
					</button>
					<h1 className="text-3xl font-bold text-gray-900 mt-4">WalletConnect</h1>
					<p className="text-gray-700 mt-2">Connect your Safe to dApps via WalletConnect</p>
				</div>

				<div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 space-y-4">
					<h2 className="font-semibold text-gray-900">Pair with dApp</h2>
					<div className="flex flex-col sm:flex-row gap-2">
						<input
							type="text"
							placeholder="wc:...@2?relay-protocol=irn&symKey=..."
							value={uriInput}
							onChange={(e) => setUriInput(e.target.value)}
							className="flex-1 border border-gray-300 rounded px-3 py-2 text-sm"
						/>
						<button
							type="button"
							onClick={handlePair}
							className="px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800 text-sm"
						>
							Connect
						</button>
					</div>
					{error && <p className="text-sm text-red-600">{error}</p>}
				</div>

				<div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
					<h2 className="font-semibold text-gray-900 mb-4">Active Sessions</h2>
					{sessionEntries.length === 0 ? (
						<p className="text-gray-600 text-sm">No active WalletConnect sessions</p>
					) : (
						<ul className="divide-y divide-gray-200">
							{sessionEntries.map((s) => (
								<li key={s.topic} className="py-3 flex items-center justify-between">
									<div>
										<p className="font-medium text-gray-900">{s.peer.metadata.name}</p>
										<p className="text-gray-600 text-xs truncate w-64 sm:w-auto">{s.peer.metadata.url}</p>
									</div>
									<span className="text-xs text-gray-500">{new Date(s.expiry * 1000).toLocaleString()}</span>
								</li>
							))}
						</ul>
					)}
				</div>
			</div>
		</div>
	);
}

const walletConnectSchema = safeIdSchema;

export const Route = createFileRoute("/walletconnect")({
	validateSearch: zodValidator(walletConnectSchema),
	component: WalletConnectPage,
});

function WalletConnectPage() {
	const { safe: safeAddress, chainId } = Route.useSearch();
	return (
		<RequireWallet>
			<WalletConnectContent safeAddress={safeAddress} chainId={chainId} />
		</RequireWallet>
	);
}
