import type { ToPathOption } from "@tanstack/react-router";
import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react"; // For precise icon typing
import { ArrowUpRight } from "lucide-react";
import type { SafeId } from "@/lib/validators";

/**
 * Props for the ActionCard component.
 */
interface ActionCardProps {
	/** The title of the action card. */
	title: string;
	/** A short description of the action. */
	description: string;
	/** The Lucide icon component to display. */
	icon: LucideIcon;
	/** The text for the call-to-action button/link. */
	ctaText: string;
	/** The path to link to. Should be a registered route. */
	to: ToPathOption;
	/** Search parameters for the link. Must include 'safe' and 'chainId'. */
	search: SafeId;
	/** Whether the action card should appear disabled. */
	disabled?: boolean;
	/** Tooltip text shown when the card is disabled to explain why. */
	disabledTooltip?: string;
}

/**
 * A card component to display an action with a title, description, icon, and a call-to-action link.
 * @param {ActionCardProps} props - The component props.
 * @returns JSX element representing the action card.
 */
function ActionCard({
	title,
	description,
	icon: Icon,
	ctaText,
	to,
	search,
	disabled = false,
	disabledTooltip,
}: ActionCardProps) {
	const CTA = disabled ? (
		<span
			title={disabledTooltip}
			className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-gray-400 rounded-md cursor-not-allowed opacity-60"
		>
			{ctaText}
		</span>
	) : (
		<Link
			to={to}
			search={search}
			className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-black rounded-md hover:bg-gray-800 transition-colors"
		>
			{ctaText}
			<ArrowUpRight className="w-4 h-4" />
		</Link>
	);

	return (
		<div
			className={`p-6 border border-gray-200 rounded-lg bg-white shadow-sm transition-shadow ${disabled ? "opacity-60 cursor-not-allowed" : "hover:shadow-md"}`}
			title={disabled ? disabledTooltip : undefined}
		>
			<div className="flex items-center gap-3 mb-4">
				<div className="p-2 bg-gray-100 rounded-full">
					<Icon className="w-5 h-5 text-gray-700" />
				</div>
				<h3 className="text-lg font-medium text-gray-900">{title}</h3>
			</div>
			<p className="text-gray-600 mb-6">{description}</p>
			{CTA}
		</div>
	);
}

export { ActionCard };
