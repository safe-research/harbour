import { Component, type ReactNode, type ErrorInfo } from "react";

interface ErrorBoundaryProps {
	children: ReactNode;
	fallback?: ReactNode;
	onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface ErrorBoundaryState {
	hasError: boolean;
	error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
	constructor(props: ErrorBoundaryProps) {
		super(props);
		this.state = { hasError: false, error: null };
	}

	static getDerivedStateFromError(error: Error): ErrorBoundaryState {
		return { hasError: true, error };
	}

	componentDidCatch(error: Error, errorInfo: ErrorInfo) {
		console.error("ErrorBoundary caught an error:", error, errorInfo);
		this.props.onError?.(error, errorInfo);
	}

	render() {
		if (this.state.hasError) {
			if (this.props.fallback) {
				return this.props.fallback;
			}

			return (
				<div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
					<div className="bg-white rounded-lg shadow-md p-6 max-w-md w-full">
						<h2 className="text-lg font-semibold text-red-600 mb-2">Something went wrong</h2>
						<p className="text-gray-600 text-sm mb-4">{this.state.error?.message || "An unexpected error occurred"}</p>
						<button
							type="button"
							onClick={() => window.location.reload()}
							className="w-full px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800 text-sm"
						>
							Reload page
						</button>
					</div>
				</div>
			);
		}

		return this.props.children;
	}
}
