import type { BrowserProvider } from "ethers";
import { useCallback, useState } from "react";
import { useSession } from "@/contexts/SessionContext";
import {
	type HarbourContractSettings,
	signAndRegisterEncryptionKey,
} from "@/lib/harbour";

interface SignAndRegisterEncryptionKeyProps {
	browserProvider?: BrowserProvider;
	currentSettings?: HarbourContractSettings;
	onRegistered?: () => void;
}

interface SignAndRegisterEncryptionKeyReturn {
	ready: boolean;
	isSubmitting: boolean;
	error: string | null;
	signAndRegister: () => void;
}

export function useSignAndRegisterEncryptionKey({
	browserProvider,
	currentSettings,
	onRegistered,
}: SignAndRegisterEncryptionKeyProps): SignAndRegisterEncryptionKeyReturn {
	const { keys, pendingRegistration } = useSession();
	const ready = !!browserProvider && !!keys && !!pendingRegistration;
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const signAndRegister = useCallback(async () => {
		setIsSubmitting(true);
		setError(null);
		try {
			if (!browserProvider || !keys || !pendingRegistration) {
				throw new Error(
					"cannot register without pending registration or relayer",
				);
			}

			await signAndRegisterEncryptionKey({
				walletProvider: browserProvider,
				registration: pendingRegistration,
				sessionKeys: keys,
				currentSettings,
			});
			onRegistered?.();
		} catch (err: unknown) {
			const message =
				err instanceof Error
					? err.message
					: "Encryption key registration failed";
			setError(message);
		} finally {
			setIsSubmitting(false);
		}
	}, [
		browserProvider,
		currentSettings,
		onRegistered,
		keys,
		pendingRegistration,
	]);
	return {
		ready,
		isSubmitting,
		error,
		signAndRegister,
	};
}
