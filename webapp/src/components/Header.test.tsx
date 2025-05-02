import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// Mock the Link component from TanStack Router to prevent router context issues
vi.mock("@tanstack/react-router", async () => {
	const actual = await vi.importActual("@tanstack/react-router");
	return {
		...actual,
		Link: (props: { to: string; children: React.ReactNode }) => <a href={props.to}>{props.children}</a>,
	};
});

import Header from "./Header";

describe("Header", () => {
	it("renders navigation links", () => {
		render(<Header />);
		expect(screen.getByRole("link", { name: /Home/i })).toBeDefined();
		expect(screen.getByRole("link", { name: /TanStack Query/i })).toBeDefined();
	});
});
