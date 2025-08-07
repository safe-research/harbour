import { SafeResearchFooter } from "./SafeResearch";

export const Footer = () => {
	return (
		<div className="bg-gray-50">
			<div className="max-w-4xl mx-auto px-4 py-12 sm:px-6 lg:px-8 pt-2">
				<div className="text-center mb-12">
					<p className="text-lg text-gray-700 max-w-2xl mx-auto">
						<SafeResearchFooter repo="harbour" />
					</p>
				</div>
			</div>
		</div>
	);
};
