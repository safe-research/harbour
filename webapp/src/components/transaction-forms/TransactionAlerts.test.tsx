import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TransactionAlerts } from "./TransactionAlerts";

describe("TransactionAlerts", () => {
	it("renders nothing if no props", () => {
		const { container } = render(<TransactionAlerts />);
		expect(container).toBeEmptyDOMElement();
	});

	it("renders transaction hash alert", () => {
		render(<TransactionAlerts transactionHash="0x123" />);
		expect(screen.getByText(/Transaction Submitted/)).toBeInTheDocument();
		expect(screen.getByText(/Transaction Hash:/)).toBeInTheDocument();
		expect(screen.getByText("0x123")).toBeInTheDocument();
		expect(
			screen.getByText(/It will be enqueued on Harbour/),
		).toBeInTheDocument();
	});

	it("renders error alert", () => {
		render(<TransactionAlerts error="Something went wrong" />);
		expect(screen.getByText(/Error/)).toBeInTheDocument();
		expect(screen.getByText("Something went wrong")).toBeInTheDocument();
	});

	it("renders warning alert", () => {
		render(<TransactionAlerts warning="Be careful!" />);
		expect(screen.getByText(/Warning/)).toBeInTheDocument();
		expect(screen.getByText("Be careful!")).toBeInTheDocument();
	});

	it("renders all alerts if all props are set", () => {
		render(
			<TransactionAlerts
				transactionHash="0xabc"
				error="Error!"
				warning="Warn!"
			/>,
		);
		expect(screen.getByText("0xabc")).toBeInTheDocument();
		expect(screen.getByText("Error!")).toBeInTheDocument();
		expect(screen.getByText("Warn!")).toBeInTheDocument();
	});
});
