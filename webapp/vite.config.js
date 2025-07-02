import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
	// Load environment variables and set base path for nested routes
	const env = loadEnv(mode, process.cwd());

	// Normalize base path to ensure it always starts and ends with a slash
	// This prevents routing issues and ensures consistent path handling across environments
	let basePath = env.VITE_BASE_PATH || "/harbour/";
	if (!basePath.startsWith("/")) {
		basePath = `/${basePath}`;
	}
	if (!basePath.endsWith("/")) {
		basePath = `${basePath}/`;
	}

	return {
		base: basePath,
		plugins: [
			TanStackRouterVite({ autoCodeSplitting: true }),
			viteReact(),
			tailwindcss(),
		],
		test: {
			globals: true,
			environment: "jsdom",
		},
		resolve: {
			alias: {
				"@": resolve(__dirname, "./src"),
			},
		},
		define: {
			// Expose the normalized base path as a constant that can be used in client code
			__BASE_PATH__: JSON.stringify(basePath),
		},
	};
});
