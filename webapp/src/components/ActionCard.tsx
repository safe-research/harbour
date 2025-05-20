import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";

export default function ActionCard({
	title,
	description,
	icon: Icon,
	ctaText,
	to,
	search,
}: {
	title: string;
	description: string;
	icon: React.ComponentType<{ className?: string }>;
	ctaText: string;
	to: string;
	search: { safe: string; chainId: number };
}) {
	return (
		<div className="p-6 border border-gray-200 rounded-lg bg-white shadow-sm hover:shadow-md transition-shadow">
			<div className="flex items-center gap-3 mb-4">
				<div className="p-2 bg-gray-100 rounded-full">
					<Icon className="w-5 h-5 text-gray-700" />
				</div>
				<h3 className="text-lg font-medium text-gray-900">{title}</h3>
			</div>
			<p className="text-gray-600 mb-6">{description}</p>
			<Link
				to={to}
				search={search}
				className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-black rounded-md hover:bg-gray-800 transition-colors"
			>
				{ctaText}
				<ArrowUpRight className="w-4 h-4" />
			</Link>
		</div>
	);
}
