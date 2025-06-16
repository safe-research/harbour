import { RouterProvider, createRouter } from "@tanstack/react-router";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";

import * as TanstackQuery from "./integrations/tanstack-query/root-provider";
import { WalletConnectProvider } from "./providers/WalletConnectProvider";
import { ErrorBoundary } from "./components/ErrorBoundary";

import { routeTree } from "./routeTree.gen";
import "./lib/onboard";

import "./styles.css";
import reportWebVitals from "./reportWebVitals.ts";

/**
 * TanStack Router instance configured with the generated route tree and TanStack Query context.
 */
const router = createRouter({
	routeTree,
	basepath: __BASE_PATH__,
	context: {
		...TanstackQuery.getContext(),
	},
	defaultPreload: "intent",
	scrollRestoration: true,
	defaultStructuralSharing: true,
	defaultPreloadStaleTime: 0,
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
	interface Register {
		router: typeof router;
	}
}

const rootElement = document.getElementById("app");
if (rootElement && !rootElement.innerHTML) {
	const root = ReactDOM.createRoot(rootElement);
	/**
	 * Renders the main application component tree into the DOM.
	 * It sets up StrictMode, the TanStack Query Provider, and the TanStack RouterProvider.
	 */
	root.render(
		<StrictMode>
			<TanstackQuery.Provider>
				<ErrorBoundary
					fallback={
						<div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
							<div className="bg-white rounded-lg shadow-md p-6 max-w-md w-full">
								<h2 className="text-lg font-semibold text-red-600 mb-2">WalletConnect initialization failed</h2>
								<p className="text-gray-600 text-sm mb-4">
									Unable to initialize WalletConnect. Please check your connection and try again.
								</p>
								<button
									type="button"
									onClick={() => window.location.reload()}
									className="w-full px-4 py-2 bg-gray-900 text-white rounded hover:bg-gray-800 text-sm"
								>
									Reload page
								</button>
							</div>
						</div>
					}
				>
					<WalletConnectProvider router={router}>
						<RouterProvider router={router} />
					</WalletConnectProvider>
				</ErrorBoundary>
			</TanstackQuery.Provider>
		</StrictMode>,
	);
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
