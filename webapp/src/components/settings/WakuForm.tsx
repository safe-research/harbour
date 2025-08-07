import { useEffect, useState } from "react";
import { useWaku, WakuState } from "@/contexts/WakuContext";

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

function WakuForm() {
	const [status, setStatus] = useState<WakuState>();
	const waku = useWaku();

	useEffect(() => {
		waku.watchStatus(setStatus);
		return () => {
			waku.unwatchStatus(setStatus);
		};
	}, [waku]);

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
