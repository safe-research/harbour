import fs from "node:fs/promises";
import path from "node:path";
import type { Plugin } from "vite";

/**
 * A Vite plugin that copies `index.html` to all React Router file routes as a
 * post-build step, enabling path-based routing from static HTTP file servers.
 *
 * Note that this plugin only works if **no** routes contain path parameters.
 */
function routing() {
	const plugin: Plugin = {
		name: "routing",
		async writeBundle(outputOptions) {
			const dist = outputOptions.dir ?? ".";
			const index = path.join(dist, "index.html");
			const tree = await parseRouteTree();
			for (const route of tree.filter((route) => route !== "/")) {
				const dir = path.join(dist, route.replace(/^\//, ""));
				const file = path.join(dir, "index.html");
				await fs.mkdir(dir, { recursive: true });
				await fs.copyFile(index, file);
			}
		},
	};
	return plugin;
}

/**
 * Read the routing tree from the React Router generated file.
 *
 * This ensures that as the plugin continues to work as routes are added and
 * removed without manual configuration changes.
 */
async function parseRouteTree() {
	// We take advantage that `routeTree.gen.ts` includes a type for mapping full
	// paths to the route type. We parse that out of the file and use it to list
	// all routes that we need to support.
	const tree = await fs.readFile("src/routeTree.gen.ts", "utf-8");

	// TODO: This parsing is flimsy at best, and may break if we start putting
	// special characters into our paths, or React Router changes to use slightly
	// different TypeScript syntax. Since I don't expect either to happen, this
	// is good enough for now. In case either of those conditions change, this
	// parsing implementation should be made more robust.
	const [, start] = tree.split("interface FileRoutesByFullPath {");
	const [body] = start.split("}");
	const routes = body
		.trim()
		.split("\n")
		.map((line) => line.trim().split(":")[0].split("'")[1]);

	return routes;
}

export { routing };
