import { ExternalLink } from "lucide-react";
import { useCallback } from "react";
import type { SettingsFormData } from "@/components/settings/SettingsForm";
import { useSession } from "@/contexts/SessionContext";
import { useBrowserProvider } from "@/hooks/useBrowserProvider";
import { useRelayerBalanceInfo } from "@/hooks/useRelayerBalanceInfo";
import { useSignAndRegisterEncryptionKey } from "@/hooks/useSignAndRegisterEncryptionKey";

interface EncryptionFormParameters {
	currentSettings: Partial<SettingsFormData>;
}

function EncryptionForm({ currentSettings }: EncryptionFormParameters) {
	const browserProvider = useBrowserProvider();
	const { keys, pendingRegistration, isUpdating, connect, create, error } =
		useSession();
	const { ready, isSubmitting, signAndRegister } =
		useSignAndRegisterEncryptionKey({
			browserProvider,
			currentSettings,
			onRegistered: connect,
		});
	const { data: relayerBalance } = useRelayerBalanceInfo(currentSettings);

	const handleSignin = useCallback(async () => {
		create();
	}, [create]);

	return (
		<div>
			<span className="block text-sm font-medium text-gray-700 mb-1">
				Encryption {"🔐"}
			</span>
			{!keys ? (
				<button
					type="button"
					onClick={handleSignin}
					disabled={isUpdating}
					className="px-4 py-2 text-sm font-medium bg-black text-white rounded hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
				>
					Sign In
				</button>
			) : (
				<>
					<div className="flex space-x-2 pl-4">
						<span className="text-sm">
							Public Key: <code>{keys.encryption.publicKeyHex}</code>
						</span>
					</div>
					<div className="flex space-x-2 pl-4">
						<span className="text-sm">
							Notary: <code>{keys.relayer.address}</code>{" "}
							{relayerBalance?.needsFunding && relayerBalance?.faucet ? (
								<a
									className="ml-3 underline"
									target="_blank"
									rel="noopener noreferrer"
									href={relayerBalance.faucet}
								>
									<ExternalLink className="inline" size={16} /> fund
								</a>
							) : (
								<span className="ml-3 text-gray-700">
									{relayerBalance?.formatted ?? "Loading balance..."}
								</span>
							)}
						</span>
						{pendingRegistration && (
							<button
								type="button"
								disabled={
									relayerBalance?.needsFunding !== false ||
									!ready ||
									isSubmitting
								}
								onClick={signAndRegister}
								className="px-4 py-2 text-sm font-medium bg-black text-white rounded hover:bg-gray-800 transition ml-auto disabled:opacity-50 disabled:cursor-not-allowed"
							>
								Register
							</button>
						)}
					</div>
				</>
			)}
			{error && <p className="mt-1 text-sm text-red-600">{error?.message}</p>}
		</div>
	);
}

export { EncryptionForm, type EncryptionFormParameters };
