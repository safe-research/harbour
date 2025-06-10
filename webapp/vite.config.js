import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

import { resolve } from "node:path";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
	// Load environment variables and set base path for nested routes
	const env = loadEnv(mode, process.cwd());
	const basePath = env.VITE_BASE_PATH || "/harbour/";
	return {
		base: basePath,
		plugins: [TanStackRouterVite({ autoCodeSplitting: true }), viteReact(), tailwindcss()],
		test: {
			globals: true,
			environment: "jsdom",
		},
		resolve: {
			alias: {
				"@": resolve(__dirname, "./src"),
			},
		},
	};
});
