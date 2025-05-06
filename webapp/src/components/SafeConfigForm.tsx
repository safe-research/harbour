import { useState } from "react";

interface SafeConfigFormProps {
	onSubmit: (rpcUrl: string, safeAddress: string) => void;
}

export default function SafeConfigForm({ onSubmit }: SafeConfigFormProps) {
	const [rpcUrl, setRpcUrl] = useState("");
	const [safeAddress, setSafeAddress] = useState("");
	const [errors, setErrors] = useState<{ rpcUrl?: string; safeAddress?: string }>({});

	const validate = () => {
		const errs: { rpcUrl?: string; safeAddress?: string } = {};
		if (!rpcUrl.trim()) errs.rpcUrl = "RPC URL is required";
		const addr = safeAddress.trim();
		if (!/^0x[a-fA-F0-9]{40}$/.test(addr)) errs.safeAddress = "Invalid Safe address";
		setErrors(errs);
		return Object.keys(errs).length === 0;
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!validate()) return;
		onSubmit(rpcUrl.trim(), safeAddress.trim());
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
			<div>
				<label htmlFor="rpcUrl" className="block font-medium">
					RPC URL
				</label>
				<input
					id="rpcUrl"
					type="text"
					value={rpcUrl}
					onChange={(e) => setRpcUrl(e.target.value)}
					placeholder="https://..."
					className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
				/>
				{errors.rpcUrl && <p className="text-red-600">{errors.rpcUrl}</p>}
			</div>

			<div>
				<label htmlFor="safeAddress" className="block font-medium">
					Safe Address
				</label>
				<input
					id="safeAddress"
					type="text"
					value={safeAddress}
					onChange={(e) => setSafeAddress(e.target.value)}
					placeholder="0x..."
					className="mt-1 block w-full border border-gray-300 rounded-md px-3 py-2"
				/>
				{errors.safeAddress && <p className="text-red-600">{errors.safeAddress}</p>}
			</div>

			<button
				type="submit"
				className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
			>
				Fetch Configuration
			</button>
		</form>
	);
}
