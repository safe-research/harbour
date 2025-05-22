import { useState } from "react";
import { ETHEREUM_ADDRESS_REGEX } from "../lib/validators";

interface SafeAddressFormProps {
	/**
	 * Callback function invoked when the form is submitted with a valid Safe address and chain ID.
	 * @param {string} safeAddress - The validated Safe address.
	 * @param {number} chainId - The validated chain ID.
	 */
	onSubmit: (safeAddress: string, chainId: number) => void;
}

/**
 * A form component for inputting a Safe address and chain ID.
 * It includes validation for both fields.
 * @param {SafeAddressFormProps} props - The component props.
 * @returns JSX element representing the form.
 */
export default function SafeAddressForm({ onSubmit }: SafeAddressFormProps) {
	const [safeAddress, setSafeAddress] = useState("");
	const [chainIdInput, setChainIdInput] = useState<string>(); // Store input as string
	const [errors, setErrors] = useState<{ safeAddress?: string; chainId?: string }>({});

	/**
	 * Validates the current form inputs.
	 * @returns True if the form is valid, false otherwise.
	 */
	const validate = () => {
		const errs: { safeAddress?: string; chainId?: string } = {};
		const addr = safeAddress.trim();
		const parsedChainId = Number.parseInt(chainIdInput ?? "0", 10);

		if (!ETHEREUM_ADDRESS_REGEX.test(addr)) {
			errs.safeAddress = "Invalid Safe address (must be an Ethereum address)";
		}
		if (Number.isNaN(parsedChainId) || parsedChainId <= 0) {
			errs.chainId = "Chain ID must be a positive number";
		}
		setErrors(errs);
		return Object.keys(errs).length === 0;
	};

	/**
	 * Handles the form submission event.
	 * Prevents default form submission, validates inputs, and calls the onSubmit prop.
	 * @param {React.FormEvent} e - The form submission event.
	 */
	const handleSubmit = (e: React.FormEvent) => {
		e.preventDefault();
		if (!validate()) return;
		const finalChainId = Number.parseInt(chainIdInput ?? "0", 10);
		// Validation ensures finalChainId is a valid number here
		onSubmit(safeAddress.trim(), finalChainId);
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
					type="number" // Keep type=number for browser behavior, but parse from string state
					value={chainIdInput} // Use string state for input value
					onChange={(e) => setChainIdInput(e.target.value)} // Update string state
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
