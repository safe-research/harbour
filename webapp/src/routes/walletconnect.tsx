import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { useCallback, useMemo, useState } from "react";
import { safeIdSchema } from "@/lib/validators";
import { walletConnectUriSchema } from "@/lib/walletconnect";
import { BackToDashboardButton } from "../components/BackButton";
import { RequireWallet } from "../components/RequireWallet";
import { SessionsList } from "../components/walletconnect/SessionsList";
import {
	useRegisterSafeContext,
	useWalletConnect,
} from "../hooks/walletConnect";
import type { ChainId } from "../lib/types";

type WalletConnectContentProps = {
	safe: string;
	chainId: ChainId;
};

function WalletConnectContent({ safe, chainId }: WalletConnectContentProps) {
	const { pair, sessions, error, disconnectSession } = useWalletConnect();
	const [uriInput, setUriInput] = useState("");
	const [isPairing, setIsPairing] = useState(false);
	const [validationError, setValidationError] = useState<string>();

	useRegisterSafeContext(safe, chainId);

	const handlePair = useCallback(async () => {
		const trimmedUri = uriInput.trim();
		if (!trimmedUri) return;

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

	// Memoize session transformations to avoid recreating array on every render
	const sessionEntries = useMemo(
		() => Object.values(sessions ?? {}),
		[sessions],
	);
	const hasActiveSessions = sessionEntries.length > 0;

	return (
		<div className="min-h-screen bg-gray-50">
			<div className="max-w-3xl mx-auto px-4 py-12 sm:px-6 lg:px-8 space-y-8">
				<div>
					<BackToDashboardButton safeAddress={safe} chainId={chainId} />
					<h1 className="text-3xl font-bold text-gray-900 mt-4">
						WalletConnect
					</h1>
					<p className="text-gray-700 mt-2">
						Connect your Safe to dApps via WalletConnect
					</p>
					{hasActiveSessions && (
						<p className="text-sm text-green-600 mt-1">
							{sessionEntries.length} active session
							{sessionEntries.length > 1 ? "s" : ""}
						</p>
					)}
				</div>

				<div className="bg-white rounded-lg shadow-md p-6 border border-gray-200 space-y-4">
					<h2 className="font-semibold text-gray-900">Pair with dApp</h2>
					<p className="text-sm text-gray-600 mb-2">
						Paste the WalletConnect URI from the dApp to connect your Safe
					</p>
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
					{validationError && (
						<p className="text-sm text-red-600">{validationError}</p>
					)}
					{error && <p className="text-sm text-red-600">{error}</p>}
				</div>

				<div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
					<h2 className="font-semibold text-gray-900 mb-4">Active Sessions</h2>
					<SessionsList
						sessionEntries={sessionEntries}
						disconnectSession={disconnectSession}
					/>
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
