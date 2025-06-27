import { Send } from "lucide-react";

interface SendButtonProps {
	onClick: () => void;
	disabled?: boolean;
	className?: string;
}

export function SendButton({
	onClick,
	disabled = false,
	className = "",
}: SendButtonProps) {
	return (
		<button
			type="button"
			onClick={onClick}
			disabled={disabled}
			className={`inline-flex items-center px-3 py-1.5 text-sm font-medium rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
				disabled
					? "bg-gray-300 text-gray-500 cursor-not-allowed"
					: "bg-black text-white hover:bg-gray-800 focus:ring-gray-500"
			} ${className}`}
		>
			<Send size={16} className="mr-1.5" />
			Send
		</button>
	);
}
