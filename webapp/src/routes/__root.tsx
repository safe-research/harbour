import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import Header from "../components/Header";
import { BatchProvider } from "../contexts/BatchTransactionsContext";
import ReactQueryDevtoolsSetup from "../integrations/tanstack-query/layout";

/**
 * Defines the context available to all routes in the application.
 * This includes the TanStack Query client instance.
 */
interface MyRouterContext {
	queryClient: QueryClient;
}

/**
 * The root route of the application.
 * It sets up the main layout including a header, the main content outlet,
 * and development tools for TanStack Router and React Query.
 */
export const Route = createRootRouteWithContext<MyRouterContext>()({
	component: () => (
		<BatchProvider>
			<Header />
			<Outlet />
			<TanStackRouterDevtools />
			<ReactQueryDevtoolsSetup />
		</BatchProvider>
	),
});
