import { useState } from "react";
import { ETHEREUM_ADDRESS_REGEX } from "../lib/validators";

interface SafeAddressFormProps {
	onSubmit: (safeAddress: string, chainId: number) => void;
}

export default function SafeAddressForm({ onSubmit }: SafeAddressFormProps) {
	const [safeAddress, setSafeAddress] = useState("");
	const [chainId, setChainId] = useState<number>();
	const [errors, setErrors] = useState<{ safeAddress?: string; chainId?: string }>({});

	const validate = () => {
		const errs: { safeAddress?: string; chainId?: string } = {};
		const addr = safeAddress.trim();
		if (!ETHEREUM_ADDRESS_REGEX.test(addr)) errs.safeAddress = "Invalid Safe address";
		if (!chainId || chainId <= 0) errs.chainId = "Chain ID must be a positive number";
		setErrors(errs);
		return Object.keys(errs).length === 0;
	};

	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!validate()) return;
		onSubmit(safeAddress.trim(), chainId || 1);
	};

	return (
		<form onSubmit={handleSubmit} className="space-y-4">
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
					className="mt-1 block w-full border border-gray-200 bg-white text-black placeholder-gray-400 rounded-md px-3 py-2 focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
				/>
				{errors.safeAddress && <p className="text-red-600">{errors.safeAddress}</p>}
			</div>

			<div>
				<label htmlFor="chainId" className="block font-medium">
					Chain ID
				</label>
				<input
					id="chainId"
					type="number"
					value={chainId}
					onChange={(e) => setChainId(Number(e.target.value))}
					placeholder="1"
					min="1"
					step="1"
					className="mt-1 block w-full border border-gray-200 bg-white text-black placeholder-gray-400 rounded-md px-3 py-2 focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
				/>
				{errors.chainId && <p className="text-red-600">{errors.chainId}</p>}
			</div>

			<button
				type="submit"
				className="bg-black text-white px-4 py-2 rounded-md hover:bg-gray-800 disabled:opacity-50 transition"
			>
				Load Safe
			</button>
		</form>
	);
}
