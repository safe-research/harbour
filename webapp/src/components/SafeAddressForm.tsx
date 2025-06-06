import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { chainIdSchema, safeAddressSchema } from "../lib/validators";

const safeAddressFormSchema = z.object({
	safeAddress: safeAddressSchema,
	chainId: chainIdSchema,
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
 * @param {SafeAddressFormProps} props - The component props.
 * @returns JSX element representing the form.
 */
export default function SafeAddressForm({ onSubmit }: SafeAddressFormProps) {
	const {
		register,
		handleSubmit,
		formState: { errors },
	} = useForm<SafeAddressFormData>({
		resolver: zodResolver(safeAddressFormSchema),
	});

	const onSubmitForm = (data: SafeAddressFormData) => {
		onSubmit(data.safeAddress, data.chainId);
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

			<div>
				<label htmlFor="chainId" className="block font-medium">
					Chain ID
				</label>
				<input
					id="chainId"
					type="number"
					{...register("chainId", { valueAsNumber: true })}
					placeholder="1"
					min="1"
					step="1"
					className="mt-1 block w-full border border-gray-200 bg-white text-black placeholder-gray-400 rounded-md px-3 py-2 focus:outline-none focus:border-black focus:ring-1 focus:ring-black"
				/>
				{errors.chainId && <p className="text-red-600">{errors.chainId.message}</p>}
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
