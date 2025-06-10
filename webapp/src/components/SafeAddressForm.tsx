import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useKeyNav } from "../hooks/useKeyNav";
import { useOutsideClick } from "../hooks/useOutsideClick";
import { type ChainSearchResult, resolveChainIdFromInput, searchChainsByName } from "../lib/chains";
import { chainIdOrNameSchema, safeAddressSchema } from "../lib/validators";

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
	const {
		register,
		handleSubmit,
		watch,
		setValue,
		formState: { errors },
	} = useForm<SafeAddressFormData>({
		resolver: zodResolver(safeAddressFormSchema),
	});

	// Single source of truth for chain field value
	const chainField = watch("chainIdOrName");

	// Pure derivation of suggestions
	const suggestions = useMemo(() => {
		const fieldValue = chainField || "";
		// Don't show suggestions for numeric input
		if (/^\d+$/.test(fieldValue)) {
			return [];
		}
		// Search for chain names if input is not numeric
		return fieldValue.trim().length > 0 ? searchChainsByName(fieldValue) : [];
	}, [chainField]);

	// Focus state for dropdown visibility
	const [isFocused, setFocus] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);

	// Handle clicking outside
	useOutsideClick([inputRef, listRef], () => setFocus(false));

	// Keyboard navigation
	const { index, onKey, reset } = useKeyNav(suggestions.length);

	// Handle suggestion selection
	const selectSuggestion = (suggestion: ChainSearchResult) => {
		setValue("chainIdOrName", suggestion.chainId.toString(), { shouldValidate: true });
		reset();
		inputRef.current?.focus();
	};

	// Form submission
	const onSubmitForm = ({ safeAddress, chainIdOrName }: SafeAddressFormData) => {
		const chainId = resolveChainIdFromInput(chainIdOrName);
		if (chainId) {
			onSubmit(safeAddress, chainId);
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
					{...register("chainIdOrName", {
						onBlur: () => setFocus(false),
					})}
					ref={inputRef}
					id="chainIdOrName"
					type="text"
					onFocus={() => setFocus(true)}
					onKeyDown={(e) => {
						if (index >= 0 && e.key === "Enter") {
							e.preventDefault();
							selectSuggestion(suggestions[index]);
						} else {
							onKey(e);
						}
					}}
					placeholder="1 or Ethereum Mainnet"
					className="mt-1 block w-full border border-gray-200 bg-white text-black placeholder-gray-400 rounded-md px-3 py-2 focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
					autoComplete="off"
				/>

				{/* Suggestions dropdown - shown when focused and suggestions exist */}
				{isFocused && suggestions.length > 0 && (
					<div
						ref={listRef}
						className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto"
					>
						{suggestions.map((suggestion, i) => (
							<button
								key={suggestion.chainId}
								type="button"
								className={`w-full text-left px-3 py-2 text-sm border-none bg-transparent ${
									i === index ? "bg-gray-100" : "hover:bg-gray-50"
								}`}
								onClick={() => selectSuggestion(suggestion)}
								onMouseEnter={() => reset()}
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
