import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import SafeConfigDisplay from "./SafeConfigDisplay";

describe("SafeConfigDisplay", () => {
	const config = {
		owners: ["0xOwner1", "0xOwner2"],
		threshold: 2,
		fallbackHandler: "0xFallbackHandler",
		nonce: "42",
		modules: ["0xModule1"],
		guard: "0xGuard",
		singleton: "0xSingleton",
	};

	it("renders all config fields", () => {
		render(<SafeConfigDisplay config={config} />);
		expect(screen.getByText("Basic Configuration")).toBeInTheDocument();
		expect(screen.getByText("Safe Singleton")).toBeInTheDocument();
		expect(screen.getByText(config.singleton)).toBeInTheDocument();
		expect(screen.getByText("Threshold")).toBeInTheDocument();
		expect(screen.getByText(String(config.threshold))).toBeInTheDocument();
		expect(screen.getByText("Nonce")).toBeInTheDocument();
		expect(screen.getByText(String(config.nonce))).toBeInTheDocument();
		expect(screen.getByText("Fallback Handler")).toBeInTheDocument();
		expect(screen.getByText(config.fallbackHandler)).toBeInTheDocument();
		expect(screen.getByText("Guard")).toBeInTheDocument();
		expect(screen.getByText(config.guard)).toBeInTheDocument();
		expect(screen.getByText("Owners (2)"));
		expect(screen.getByText("0xOwner1")).toBeInTheDocument();
		expect(screen.getByText("0xOwner2")).toBeInTheDocument();
		expect(screen.getByText("Modules (1)"));
		expect(screen.getByText("0xModule1")).toBeInTheDocument();
	});

	it("shows 'No modules enabled' if modules is empty", () => {
		render(<SafeConfigDisplay config={{ ...config, modules: [] }} />);
		expect(screen.getByText("No modules enabled")).toBeInTheDocument();
	});
});
