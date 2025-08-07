import type { FieldErrors, UseFormRegister } from "react-hook-form";

type TransactionFormData = {
	to: string;
	value: string;
	data: string;
	nonce: string | bigint;
};

type TransactionFormFieldsProps = {
	register: UseFormRegister<TransactionFormData>;
	errors: FieldErrors<TransactionFormData>;
	currentNonce: string | bigint;
};

/**
 * Reusable transaction form fields component that displays
 * the common fields for transaction forms (to, value, data, nonce)
 */
function TransactionFormFields({
	register,
	errors,
	currentNonce,
}: TransactionFormFieldsProps) {
	return (
		<>
			<div>
				<label
					htmlFor="to"
					className="block text-sm font-medium text-gray-700 mb-1"
				>
					To Address
				</label>
				<input
					id="to"
					type="text"
					{...register("to")}
					placeholder="0x..."
					className="mt-1 block w-full border border-gray-300 bg-white text-gray-900 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900"
				/>
				{errors.to && (
					<p className="mt-1 text-sm text-red-600">{errors.to.message}</p>
				)}
			</div>

			<div>
				<label
					htmlFor="value"
					className="block text-sm font-medium text-gray-700 mb-1"
				>
					Value (ETH)
				</label>
				<input
					id="value"
					type="text"
					{...register("value")}
					placeholder="0.0"
					className="mt-1 block w-full border border-gray-300 bg-white text-gray-900 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900"
				/>
				{errors.value && (
					<p className="mt-1 text-sm text-red-600">{errors.value.message}</p>
				)}
			</div>

			<div>
				<label
					htmlFor="data"
					className="block text-sm font-medium text-gray-700 mb-1"
				>
					Data (Hex String)
				</label>
				<input
					id="data"
					type="text"
					{...register("data")}
					placeholder="0x..."
					className="mt-1 block w-full border border-gray-300 bg-white text-gray-900 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900 font-mono text-sm"
				/>
				{errors.data && (
					<p className="mt-1 text-sm text-red-600">{errors.data.message}</p>
				)}
			</div>

			<div>
				<label
					htmlFor="nonce"
					className="block text-sm font-medium text-gray-700 mb-1"
				>
					Nonce
				</label>
				<input
					id="nonce"
					type="number"
					{...register("nonce")}
					min="0"
					step="1"
					className="mt-1 block w-full border border-gray-300 bg-white text-gray-900 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900"
				/>
				<p className="mt-1 text-sm text-gray-500">
					Current Safe nonce:{" "}
					<span className="font-medium">{currentNonce}</span>
				</p>
				{errors.nonce && (
					<p className="mt-1 text-sm text-red-600">{errors.nonce.message}</p>
				)}
			</div>
		</>
	);
}

export { TransactionFormFields };
