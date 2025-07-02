import type { ToPathOption } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import type { ChainId } from "@/lib/types";

interface BackButtonProps {
	/** The path to link to. Should be a registered route. */
	to: ToPathOption;
	/** Search parameters for the link. */
	search?: Record<string, string | number>;
	/** The content to display within the button. */
	children: React.ReactNode;
	/** Optional additional CSS classes. */
	className?: string;
}

/**
 * A generic button component that links to a previous page or a specified path.
 * Prepends a left arrow (←) to the children.
 * @param {BackButtonProps} props - The component props.
 * @returns JSX element representing the back button.
 */
function BackButton({ to, search, children, className = "" }: BackButtonProps) {
	return (
		<Link
			to={to}
			search={search}
			className={`inline-flex items-center text-black hover:underline ${className}`}
		>
			← {children}
		</Link>
	);
}

/**
 * A specialized back button that links to the Safe dashboard.
 * @param {{ safeAddress: string; chainId: ChainId }} props - Props containing the Safe address and chain ID for the dashboard link.
 * @returns JSX element representing the back to dashboard button.
 */
function BackToDashboardButton({
	safeAddress,
	chainId,
}: {
	safeAddress: string;
	chainId: ChainId;
}) {
	return (
		<BackButton to="/dashboard" search={{ safe: safeAddress, chainId }}>
			Back to Dashboard
		</BackButton>
	);
}

export { BackButton, BackToDashboardButton };
