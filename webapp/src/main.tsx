import { RouterProvider, createRouter } from "@tanstack/react-router";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";

import * as TanstackQuery from "./integrations/tanstack-query/root-provider";

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
				<RouterProvider router={router} />
			</TanstackQuery.Provider>
		</StrictMode>,
	);
}

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
