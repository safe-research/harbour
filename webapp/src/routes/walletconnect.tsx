import { safeIdSchema, walletConnectUriSchema } from "@/lib/validators";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { useCallback, useState } from "react";
import { RequireWallet } from "../components/RequireWallet";
import { useRegisterSafeContext, useWalletConnect } from "../hooks/walletConnect";
import type { ChainId } from "../lib/types";

interface WalletConnectContentProps {
	safe: string;
	chainId: ChainId;
}

function WalletConnectContent({ safe, chainId }: WalletConnectContentProps) {
	const { pair, sessions, error } = useWalletConnect();
	const [uriInput, setUriInput] = useState("");
	const [isPairing, setIsPairing] = useState(false);
	const [validationError, setValidationError] = useState<string>();
	const navigate = useNavigate();

	useRegisterSafeContext(safe, chainId);

	const handlePair = useCallback(async () => {
		const trimmedUri = uriInput.trim();
		if (!trimmedUri) return;

		// Validate URI
		const validation = walletConnectUriSchema.safeParse(trimmedUri);
		if (!validation.success) {
			setValidationError(validation.error.message);
			return;
		}

		setValidationError(undefined);
		setIsPairing(true);

		try {
			await pair(trimmedUri);
			setUriInput("");
		} finally {
			setIsPairing(false);
		}
	}, [uriInput, pair]);

	const sessionEntries = Object.values(sessions ?? {});
	const hasActiveSessions = sessionEntries.length > 0;

	return (
		<div className="min-h-screen bg-gray-50">
			<div className="max-w-3xl mx-auto px-4 py-12 sm:px-6 lg:px-8 space-y-8">
				<div>
					<button
						type="button"
						onClick={() =>
							navigate({
								to: "/dashboard",
								search: { safe, chainId },
							})
						}
						className="text-sm text-gray-600 hover:underline"
					>
						← Back to dashboard
					</button>
					<h1 className="text-3xl font-bold text-gray-900 mt-4">WalletConnect</h1>
					<p className="text-gray-700 mt-2">Connect your Safe to dApps via WalletConnect</p>
					{hasActiveSessions && (
						<p className="text-sm text-green-600 mt-1">
							{sessionEntries.length} active session
							{sessionEntries.length > 1 ? "s" : ""}
						</p>
					)}
				</div>

				<div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 space-y-4">
					<h2 className="font-semibold text-gray-900">Pair with dApp</h2>
					<p className="text-sm text-gray-600 mb-2">Paste the WalletConnect URI from the dApp to connect your Safe</p>
					<div className="flex flex-col sm:flex-row gap-2">
						<input
							type="text"
							placeholder="wc:...@2?relay-protocol=irn&symKey=..."
							value={uriInput}
							onChange={(e) => {
								setUriInput(e.target.value);
								setValidationError(undefined);
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !isPairing) {
									handlePair();
								}
							}}
							className={`flex-1 border rounded px-3 py-2 text-sm ${
								validationError ? "border-red-300" : "border-gray-300"
							}`}
							disabled={isPairing}
						/>
						<button
							type="button"
							onClick={handlePair}
							disabled={isPairing || !uriInput.trim()}
							className="px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{isPairing ? "Connecting..." : "Connect"}
						</button>
					</div>
					{validationError && <p className="text-sm text-red-600">{validationError}</p>}
					{error && <p className="text-sm text-red-600">{error}</p>}
				</div>

				<div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
					<h2 className="font-semibold text-gray-900 mb-4">Active Sessions</h2>
					{sessionEntries.length === 0 ? (
						<div className="text-center py-8">
							<p className="text-gray-600 text-sm mb-2">No active WalletConnect sessions</p>
							<p className="text-gray-500 text-xs">Connect to a dApp using the form above</p>
						</div>
					) : (
						<ul className="divide-y divide-gray-200">
							{sessionEntries.map((s) => {
								const expiryDate = new Date(s.expiry * 1000);
								const isExpired = expiryDate < new Date();

								return (
									<li key={s.topic} className="py-3 flex items-center justify-between">
										<div className="flex-1 min-w-0">
											<p className="font-medium text-gray-900">{s.peer.metadata.name}</p>
											<p className="text-gray-600 text-xs truncate">{s.peer.metadata.url}</p>
										</div>
										<div className="ml-4 flex-shrink-0">
											<span className={`text-xs ${isExpired ? "text-red-500" : "text-gray-500"}`}>
												{isExpired ? "Expired" : `Expires ${expiryDate.toLocaleString()}`}
											</span>
										</div>
									</li>
								);
							})}
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
	const { safe, chainId } = Route.useSearch();

	return (
		<RequireWallet>
			<WalletConnectContent safe={safe} chainId={chainId} />
		</RequireWallet>
	);
}
