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

// Mock the Web3 Onboard hook to prevent init errors
vi.mock("@web3-onboard/react", () => {
	return {
		init: vi.fn(),
		useConnectWallet: () => [{ wallet: null }, vi.fn(), vi.fn()],
	};
});

import Header from "./Header";

describe("Header", () => {
	it("renders navigation links and the connect button", () => {
		render(<Header />);
		expect(screen.getByRole("link", { name: /Harbour/i })).toBeDefined();
		expect(screen.getAllByText(/Connect Wallet/i)).toHaveLength(1);
	});
});
