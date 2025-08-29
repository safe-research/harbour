import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SafeResearchBanner, SafeResearchFooter } from "./SafeResearch";

describe("SafeResearchBanner", () => {
	it("renders the beta warning text", () => {
		render(<SafeResearchBanner />);
		expect(
			screen.getByText(
				/This demo is an experimental beta release. Code is not audited. Use at your own risk./,
			),
		).toBeInTheDocument();
		expect(screen.getByRole("alert")).toBeInTheDocument();
	});
});

describe("SafeResearchFooter", () => {
	it("renders the Safe Research and repo links", () => {
		render(<SafeResearchFooter repo="harbour" />);
		expect(screen.getByText("Built by Safe Research")).toBeInTheDocument();
		expect(screen.getByText("Source on GitHub")).toBeInTheDocument();
		expect(screen.getByText("Source on GitHub").closest("a")).toHaveAttribute(
			"href",
			"https://github.com/safe-research/harbour",
		);
	});
});
