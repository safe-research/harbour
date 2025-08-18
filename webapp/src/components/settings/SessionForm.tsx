import { ethers, type Wallet } from "ethers";
import { useEffect, useState } from "react";
import { useSession } from "@/contexts/SessionContext";
import { useHarbourRpcProvider } from "@/hooks/useRpcProvider";

function EncryptionForm() {
	const session = useSession();
	const { provider } = useHarbourRpcProvider();

	const [relayer, setRelayer] = useState<Wallet | null>(null);
	const [relayerBalance, setRelayerBalance] = useState<bigint | null>(null);

	useEffect(() => {
		const h
		waku.watchStatus(setStatus);
		return () => {
			waku.unwatchStatus(setStatus);
		};
	}, [session, provider, setRelayerBalance]);

	const toggleEncryption = () => {
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
