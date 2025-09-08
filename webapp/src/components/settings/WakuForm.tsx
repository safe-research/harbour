import { useEffect, useState } from "react";
import type { SettingsFormData } from "@/components/settings/SettingsForm";
import { useWaku, WakuState } from "@/contexts/WakuContext";
import {
	getHarbourChainId,
	HARBOUR_ADDRESS,
	HARBOUR_CHAIN_ID,
} from "@/lib/harbour";

const mapWakuState = (status: WakuState | undefined): string => {
	switch (status) {
		case WakuState.DISABLED:
			return "Disabled";
		case WakuState.STARTING:
			return "Starting";
		case WakuState.CONNECTING:
			return "Connecting";
		case WakuState.CONNECTED:
			return "Connected";
		default:
			return "Unknown";
	}
};

interface WakuFormProps {
	currentSettings: Partial<SettingsFormData>;
}

function WakuForm({
	currentSettings: { harbourAddress, rpcUrl },
}: WakuFormProps) {
	const [status, setStatus] = useState<WakuState>();
	const [supported, setSupported] = useState<boolean | null>(null);
	const waku = useWaku();

	useEffect(() => {
		waku.watchStatus(setStatus);
		return () => {
			waku.unwatchStatus(setStatus);
		};
	}, [waku]);

	// Waku does not support setting alternative harbour deployments, so read
	// the harbour address and chain from the current settings and decide
	// whether or not Waku is supported.
	useEffect(() => {
		let cancelled = false;
		getHarbourChainId({ rpcUrl }).then((chainId) => {
			if (cancelled) {
				return;
			}

			const customHarbour =
				harbourAddress && harbourAddress !== HARBOUR_ADDRESS;
			const customChain = chainId !== HARBOUR_CHAIN_ID;
			if (customHarbour || customChain) {
				waku.disable();
				waku.stop();
				setSupported(false);
			} else {
				setSupported(true);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [harbourAddress, rpcUrl, waku]);

	const toggleWaku = () => {
		if (status === WakuState.DISABLED) {
			waku.enable();
			waku.setup();
		} else {
			waku.disable();
			waku.stop();
		}
	};

	const wakuStatus = mapWakuState(status);

	return (
		<div>
			<div className="flex space-x-2">
				<input
					id="waku-enabled"
					type="checkbox"
					checked={status !== WakuState.DISABLED}
					onClick={toggleWaku}
					disabled={supported !== true}
					value=""
					className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded-sm focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
				/>
				<label
					htmlFor="waku-enabled"
					className="block text-sm font-medium text-gray-700 mb-1"
				>
					Use Waku
				</label>
			</div>
			<div className="flex">Status: {wakuStatus}</div>
		</div>
	);
}

export { WakuForm };
