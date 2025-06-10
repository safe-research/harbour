import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { type ChainSearchResult, resolveChainIdFromInput, searchChainsByName } from "../lib/chains";
import { chainIdOrNameSchema, numericStringSchema, safeAddressSchema } from "../lib/validators";

const safeAddressFormSchema = z.object({
	safeAddress: safeAddressSchema,
	chainIdOrName: chainIdOrNameSchema,
});

type SafeAddressFormData = z.infer<typeof safeAddressFormSchema>;

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
 * It includes validation for both fields using react-hook-form and zod.
 * The chain ID field supports both numeric chain IDs and fuzzy search by chain name.
 * @param {SafeAddressFormProps} props - The component props.
 * @returns JSX element representing the form.
 */
export default function SafeAddressForm({ onSubmit }: SafeAddressFormProps) {
	const [chainInput, setChainInput] = useState("");
	const [suggestions, setSuggestions] = useState<ChainSearchResult[]>([]);
	const [showSuggestions, setShowSuggestions] = useState(false);
	const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(-1);
	const chainInputRef = useRef<HTMLInputElement>(null);
	const suggestionsRef = useRef<HTMLDivElement>(null);

	const {
		register,
		handleSubmit,
		formState: { errors },
		setValue,
		trigger,
	} = useForm<SafeAddressFormData>({
		resolver: zodResolver(safeAddressFormSchema),
	});

	// Handle chain input changes and trigger search
	useEffect(() => {
		// Update the form value
		setValue("chainIdOrName", chainInput);

		// Don't show suggestions for numeric input
		if (numericStringSchema.safeParse(chainInput).success) {
			setSuggestions([]);
			setShowSuggestions(false);
			return;
		}

		// Search for chain names if input is not numeric
		if (chainInput.trim().length > 0) {
			const results = searchChainsByName(chainInput);
			setSuggestions(results);
			setShowSuggestions(results.length > 0);
			setSelectedSuggestionIndex(-1);
		} else {
			setSuggestions([]);
			setShowSuggestions(false);
		}
	}, [chainInput, setValue]);

	// Handle suggestion selection
	const selectSuggestion = (suggestion: ChainSearchResult) => {
		setChainInput(suggestion.chainId.toString());
		setShowSuggestions(false);
		setSuggestions([]);
		setSelectedSuggestionIndex(-1);

		// Focus back to input for better UX
		chainInputRef.current?.focus();

		// Trigger validation after setting the value
		setTimeout(() => trigger("chainIdOrName"), 0);
	};

	// Handle keyboard navigation
	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (!showSuggestions || suggestions.length === 0) return;

		switch (e.key) {
			case "ArrowDown":
				e.preventDefault();
				setSelectedSuggestionIndex((prev) => (prev < suggestions.length - 1 ? prev + 1 : 0));
				break;
			case "ArrowUp":
				e.preventDefault();
				setSelectedSuggestionIndex((prev) => (prev > 0 ? prev - 1 : suggestions.length - 1));
				break;
			case "Enter":
				e.preventDefault();
				if (selectedSuggestionIndex >= 0) {
					selectSuggestion(suggestions[selectedSuggestionIndex]);
				}
				break;
			case "Escape":
				setShowSuggestions(false);
				setSelectedSuggestionIndex(-1);
				break;
		}
	};

	// Close suggestions when clicking outside
	useEffect(() => {
		const handleClickOutside = (event: MouseEvent) => {
			if (
				suggestionsRef.current &&
				!suggestionsRef.current.contains(event.target as Node) &&
				chainInputRef.current &&
				!chainInputRef.current.contains(event.target as Node)
			) {
				setShowSuggestions(false);
				setSelectedSuggestionIndex(-1);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const onSubmitForm = (data: SafeAddressFormData) => {
		const chainId = resolveChainIdFromInput(data.chainIdOrName);
		if (chainId) {
			onSubmit(data.safeAddress, chainId);
		}
	};

	return (
		<form onSubmit={handleSubmit(onSubmitForm)} className="space-y-4">
			<div>
				<label htmlFor="safeAddress" className="block font-medium">
					Safe Address
				</label>
				<input
					id="safeAddress"
					type="text"
					{...register("safeAddress")}
					placeholder="0x..."
					className="mt-1 block w-full border border-gray-200 bg-white text-black placeholder-gray-400 rounded-md px-3 py-2 focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
				/>
				{errors.safeAddress && <p className="text-red-600">{errors.safeAddress.message}</p>}
			</div>

			<div className="relative">
				<label htmlFor="chainIdOrName" className="block font-medium">
					Chain ID or Chain Name
				</label>
				<input
					ref={chainInputRef}
					id="chainIdOrName"
					type="text"
					value={chainInput}
					onChange={(e) => setChainInput(e.target.value)}
					onKeyDown={handleKeyDown}
					onFocus={() => {
						if (suggestions.length > 0 && !numericStringSchema.safeParse(chainInput).success) {
							setShowSuggestions(true);
						}
					}}
					placeholder="1 or Ethereum Mainnet"
					className="mt-1 block w-full border border-gray-200 bg-white text-black placeholder-gray-400 rounded-md px-3 py-2 focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
					autoComplete="off"
				/>

				{/* Suggestions dropdown */}
				{showSuggestions && suggestions.length > 0 && (
					<div
						ref={suggestionsRef}
						className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto"
					>
						{suggestions.map((suggestion, index) => (
							<button
								key={suggestion.chainId}
								type="button"
								className={`w-full text-left px-3 py-2 text-sm border-none bg-transparent ${
									index === selectedSuggestionIndex ? "bg-gray-100" : "hover:bg-gray-50"
								}`}
								onClick={() => selectSuggestion(suggestion)}
								onMouseEnter={() => setSelectedSuggestionIndex(index)}
							>
								<div className="font-medium">{suggestion.name}</div>
								<div className="text-gray-500 text-xs">Chain ID: {suggestion.chainId}</div>
							</button>
						))}
					</div>
				)}

				{errors.chainIdOrName && <p className="text-red-600">{errors.chainIdOrName.message}</p>}
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
