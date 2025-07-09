import type {
	FieldError,
	FieldPath,
	FieldValues,
	UseFormRegister,
} from "react-hook-form";

function FormItem<T extends FieldValues>({
	id,
	error,
	label,
	placeholder,
	register,
}: {
	id: FieldPath<T>;
	error: FieldError | undefined;
	label: string;
	placeholder?: string;
	register: UseFormRegister<T>;
}) {
	return (
		<div>
			<label
				htmlFor={id}
				className="block text-sm font-medium text-gray-700 mb-1"
			>
				{label}
			</label>
			<input
				id={id}
				type="text"
				{...register(id)}
				placeholder={placeholder}
				className="mt-1 block w-full border border-gray-300 bg-white text-gray-900 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-gray-900 focus:border-gray-900"
			/>
			{error && <p className="mt-1 text-sm text-red-600">{error.message}</p>}
		</div>
	);
}

function SubmitItem({
	isSubmitting,
	actionTitle,
	disabled = false,
}: {
	isSubmitting: boolean;
	actionTitle: string;
	disabled?: boolean;
}) {
	return (
		<div className="pt-4 flex space-x-4">
			<button
				type="submit"
				disabled={isSubmitting || disabled}
				className="flex-1 flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-gray-900 hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200"
			>
				{isSubmitting ? (
					<>
						<LoadingSpinner />
						Processing...
					</>
				) : (
					actionTitle
				)}
			</button>
		</div>
	);
}

function ErrorItem({ error }: { error: string | undefined }) {
	return (
		error && (
			<div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-md">
				<h3 className="text-sm font-medium text-red-800">Error</h3>
				<p className="mt-1 text-sm text-red-700">{error}</p>
			</div>
		)
	);
}

function LoadingSpinner() {
	return (
		<svg
			className="animate-spin -ml-1 mr-3 h-5 w-5 text-white"
			xmlns="http://www.w3.org/2000/svg"
			fill="none"
			viewBox="0 0 24 24"
		>
			<title>Processing...</title>
			<circle
				className="opacity-25"
				cx="12"
				cy="12"
				r="10"
				stroke="currentColor"
				strokeWidth="4"
			/>
			<path
				className="opacity-75"
				fill="currentColor"
				d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
			/>
		</svg>
	);
}

export { FormItem, LoadingSpinner, SubmitItem, ErrorItem };
