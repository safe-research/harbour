export const SafeResearchBanner = () => {
	return (
		<div
			className="flex items-center p-2 text-sm text-yellow-800 border border-yellow-300 rounded-lg bg-yellow-50"
			role="alert"
		>
			<svg
				className="shrink-0 inline w-4 h-4 me-3"
				aria-hidden="true"
				xmlns="http://www.w3.org/2000/svg"
				fill="currentColor"
				viewBox="0 0 20 20"
			>
				<path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5ZM9.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM12 15H8a1 1 0 0 1 0-2h1v-3H8a1 1 0 0 1 0-2h2a1 1 0 0 1 1 1v4h1a1 1 0 0 1 0 2Z" />
			</svg>
			This demo is an experimental beta release. Code is not audited. Use at
			your own risk.
		</div>
	);
};

export const SafeResearchFooter = ({ repo }: { repo: string }) => {
	return (
		<div className="text-sm text-gray-700 bg-gray-50 text-center text-gray pb-12">
			<a
				href="https://github.com/safe-research"
				target="_blank"
				rel="noopener noreferrer"
				className="hover:underline"
			>
				Built by Safe Research
			</a>
			&nbsp;&hearts;&nbsp;
			<a
				href={`https://github.com/safe-research/${repo}`}
				target="_blank"
				rel="noopener noreferrer"
				className="hover:underline"
			>
				Source on GitHub
			</a>
		</div>
	);
};
