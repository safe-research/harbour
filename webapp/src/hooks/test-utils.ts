import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

export function createQueryClientWrapper() {
	const queryClient = new QueryClient();
	const wrapper = ({ children }: { children: React.ReactNode }) =>
		React.createElement(QueryClientProvider, { client: queryClient }, children);

	return wrapper;
}
