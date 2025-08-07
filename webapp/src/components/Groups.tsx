interface GroupProps {
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
function Box({ children, className = "" }: GroupProps) {
	return (
		<div
			className={`bg-white p-6 border border-gray-200 rounded-lg ${className}`}
		>
			{children}
		</div>
	);
}

function BoxTitle({ children }: { children: React.ReactNode }) {
	return <h2 className="text-lg font-semibold text-black mb-4">{children}</h2>;
}

function Container({ children, className = "" }: GroupProps) {
	return (
		<div className="min-h-screen bg-gray-50">
			<div className={`max-w-5xl mx-auto p-6 ${className}`}>{children}</div>
		</div>
	);
}

function ContainerTitle({ children }: { children: React.ReactNode }) {
	return <h1 className="text-3xl font-bold text-gray-900 mb-4">{children}</h1>;
}

function ContainerSectionTitle({ children }: { children: React.ReactNode }) {
	return <h1 className="text-3xl font-bold text-gray-900">{children}</h1>;
}

export { Box, BoxTitle, Container, ContainerTitle, ContainerSectionTitle };
