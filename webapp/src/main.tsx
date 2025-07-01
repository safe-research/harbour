import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";

import { ErrorBoundary } from "./components/ErrorBoundary";
import * as TanstackQuery from "./integrations/tanstack-query/root-provider";
import { WalletConnectProvider } from "./providers/WalletConnectProvider";

import { routeTree } from "./routeTree.gen";
// Import the onboard library so it initializes correctly
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

	root.render(
		<StrictMode>
			<TanstackQuery.Provider>
				<ErrorBoundary>
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
