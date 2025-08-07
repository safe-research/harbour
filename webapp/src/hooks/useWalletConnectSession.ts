import type { AnyRouter } from "@tanstack/react-router";
import { ethers } from "ethers";
import { useCallback, useEffect, useState } from "react";
import type { SafeId } from "@/lib/validators";
import { ethTransactionParamsSchema } from "@/lib/validators";
import {
	getSdkError,
	isEthSendTransaction,
	type SessionTypes,
	WALLETCONNECT_EVENTS,
	type WalletKitInstance,
	type WalletKitTypes,
} from "@/lib/walletconnect";

type UseWalletConnectSessionProps = {
	walletkit: WalletKitInstance | null;
	router: AnyRouter;
	safeIdRef: React.MutableRefObject<SafeId | null>;
};

/**
 * Hook for managing WalletConnect session lifecycle and events.
 * Handles session proposals, requests, and deletions with proper Safe context integration.
 *
 * @param props.walletkit - WalletKit instance for WalletConnect operations
 * @param props.router - Router instance for navigation
 * @param props.safeIdRef - Ref containing current Safe context (safe address and chainId)
 * @returns Object containing sessions, error state, and session management functions
 */
export function useWalletConnectSession({
	walletkit,
	router,
	safeIdRef,
}: UseWalletConnectSessionProps) {
	const [sessions, setSessions] = useState<Record<string, SessionTypes.Struct>>(
		{},
	);
	const [error, setError] = useState<string | null>(null);

	/**
	 * Synchronizes local session state with active sessions from WalletKit instance.
	 * Can optionally accept a specific WalletKit instance to sync from.
	 */
	const syncSessions = useCallback(
		(wkInstance?: WalletKitInstance): void => {
			const instance = wkInstance ?? walletkit;
			if (!instance) return;
			const active = instance.getActiveSessions();
			setSessions(active);
		},
		[walletkit],
	);

	/**
	 * Handles incoming session proposals from dApps.
	 * Validates Safe context availability and constructs proper namespaces for approval.
	 * Rejects proposals if no Safe context is available.
	 *
	 * @param proposal - WalletConnect session proposal from dApp
	 * @param wk - WalletKit instance to respond with
	 * @param isCleanedUp - Flag indicating if component is unmounted
	 */
	const handleSessionProposal = useCallback(
		async (
			proposal: WalletKitTypes.SessionProposal,
			wk: WalletKitInstance,
			isCleanedUp: boolean,
		): Promise<void> => {
			if (isCleanedUp) return;
			setError(null);

			if (!safeIdRef.current) {
				await wk.rejectSession({
					id: proposal.id,
					reason: getSdkError("UNSUPPORTED_ACCOUNTS"),
				});
				return;
			}

			// WORKAROUND: WalletConnect session proposals under eip155 may not include our Safe's current chain.
			const requiredChains = proposal.params.requiredNamespaces?.eip155.chains;
			const eip155ChainIds = [`eip155:${safeIdRef.current.chainId}`].concat(
				requiredChains ?? [],
			);
			const eip155Accounts = eip155ChainIds.map(
				(eip155ChainId) =>
					`${eip155ChainId}:${safeIdRef.current?.safe.toLowerCase()}`,
			);

			const namespaces = {
				eip155: {
					methods: proposal.params.requiredNamespaces?.eip155?.methods || [],
					events: proposal.params.requiredNamespaces?.eip155?.events || [],
					accounts: eip155Accounts,
				},
			};

			try {
				await wk.approveSession({ id: proposal.id, namespaces });
				syncSessions();
			} catch (err: unknown) {
				const msg =
					err instanceof Error
						? err.message
						: typeof err === "string"
							? err
							: JSON.stringify(err);
				console.error("Failed to approve WalletConnect session", err);
				setError(`Failed to approve WalletConnect session: ${msg}`);
			}
		},
		[safeIdRef, syncSessions],
	);

	/**
	 * Handles incoming session requests from connected dApps.
	 * Processes eth_sendTransaction requests by navigating to transaction form.
	 * Extracts dApp metadata and transaction parameters for user approval.
	 *
	 * @param event - WalletConnect session request event
	 * @param wk - WalletKit instance to respond with
	 * @param isCleanedUp - Flag indicating if component is unmounted
	 */
	const handleSessionRequest = useCallback(
		async (
			event: WalletKitTypes.SessionRequest,
			wk: WalletKitInstance,
			isCleanedUp: boolean,
		): Promise<void> => {
			if (isCleanedUp) return;
			setError(null);

			if (isEthSendTransaction(event)) {
				const requestParams = event.params.request.params;

				if (Array.isArray(requestParams) && requestParams.length > 0) {
					const parsedTx = ethTransactionParamsSchema.safeParse(
						requestParams[0],
					);

					if (!parsedTx.success) {
						console.error(
							"Invalid transaction params:",
							parsedTx.error.issues || parsedTx.error,
						);
						try {
							await wk.respondSessionRequest({
								topic: event.topic,
								response: {
									id: event.id,
									jsonrpc: "2.0",
									error: {
										code: -32602,
										message: "Invalid transaction parameters",
									},
								},
							});
						} catch (err) {
							console.error("Failed to respond with error", err);
						}
						return;
					}

					if (safeIdRef.current) {
						const activeSessions = wk.getActiveSessions();
						const sessionMetadata = activeSessions[event.topic];
						const wcAppName =
							sessionMetadata?.peer?.metadata?.name ?? "Unknown dApp";
						const wcAppUrl = sessionMetadata?.peer?.metadata?.url ?? "";
						const wcAppIcon = sessionMetadata?.peer?.metadata?.icons?.[0] ?? "";
						const wcAppDescription =
							sessionMetadata?.peer?.metadata?.description ?? "";

						let ethValue = "0";
						if (parsedTx.data.value) {
							try {
								const wei = BigInt(parsedTx.data.value);
								ethValue = ethers.formatEther(wei);
							} catch {}
						}

						router.navigate({
							to: "/enqueue",
							search: {
								safe: safeIdRef.current.safe,
								chainId: safeIdRef.current.chainId,
								flow: "walletconnect",
								txTo: parsedTx.data.to,
								txData: parsedTx.data.data ?? "",
								txValue: ethValue,
								wcApp: wcAppName,
								wcAppUrl,
								wcAppIcon,
								wcAppDescription,
								topic: event.topic,
								reqId: event.id.toString(),
							},
						});
					}
					return;
				}
			}

			try {
				await wk.respondSessionRequest({
					topic: event.topic,
					response: { id: event.id, jsonrpc: "2.0", result: null },
				});
			} catch (err: unknown) {
				console.error(
					"Failed to respond to WalletConnect session request",
					err,
				);
			}
		},
		[safeIdRef, router],
	);

	/**
	 * Handles session deletion events from WalletConnect.
	 * Syncs local session state when a session is deleted.
	 *
	 * @param isCleanedUp - Flag indicating if component is unmounted
	 */
	const handleSessionDelete = useCallback(
		(isCleanedUp: boolean): void => {
			if (isCleanedUp) return;
			syncSessions();
		},
		[syncSessions],
	);

	// Setup event listeners
	useEffect(() => {
		if (!walletkit) return;

		let isCleanedUp = false;
		type OffEventName = Parameters<WalletKitInstance["off"]>[0];
		type OffHandler = Parameters<WalletKitInstance["off"]>[1];
		const listeners: Array<[OffEventName, OffHandler]> = [];

		const onSessionProposal = (proposal: WalletKitTypes.SessionProposal) =>
			handleSessionProposal(proposal, walletkit, isCleanedUp);
		const onSessionRequest = (event: WalletKitTypes.SessionRequest) =>
			handleSessionRequest(event, walletkit, isCleanedUp);
		const onSessionDelete = () => handleSessionDelete(isCleanedUp);

		walletkit.on(WALLETCONNECT_EVENTS.SESSION_PROPOSAL, onSessionProposal);
		listeners.push([
			WALLETCONNECT_EVENTS.SESSION_PROPOSAL as OffEventName,
			onSessionProposal as OffHandler,
		]);

		walletkit.on(WALLETCONNECT_EVENTS.SESSION_REQUEST, onSessionRequest);
		listeners.push([
			WALLETCONNECT_EVENTS.SESSION_REQUEST as OffEventName,
			onSessionRequest as OffHandler,
		]);

		walletkit.on(WALLETCONNECT_EVENTS.SESSION_DELETE, onSessionDelete);
		listeners.push([
			WALLETCONNECT_EVENTS.SESSION_DELETE as OffEventName,
			onSessionDelete as OffHandler,
		]);

		// Initial sync
		syncSessions();

		return () => {
			isCleanedUp = true;
			for (const [evtName, handler] of listeners) {
				try {
					walletkit.off(evtName, handler);
				} catch (err) {
					console.error("Failed to remove WalletKit listener", err);
				}
			}
		};
	}, [
		walletkit,
		handleSessionProposal,
		handleSessionRequest,
		handleSessionDelete,
		syncSessions,
	]);

	return {
		sessions,
		error,
		setError,
		syncSessions,
	};
}
