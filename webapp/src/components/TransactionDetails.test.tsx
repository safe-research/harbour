import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TransactionDetails } from "./TransactionDetails";

describe("TransactionDetails", () => {
	const baseDetails = {
		to: "0x123",
		value: "1000",
		data: "0xdeadbeef",
		operation: 0,
		safeTxGas: "0",
		baseGas: "0",
		gasPrice: "0",
		gasToken: "0x0",
		refundReceiver: "0x0",
		stored: true,
	};

	it("renders all fields and decode link for non-empty data", () => {
		render(<TransactionDetails details={baseDetails} />);
		// The param names are in a <strong> tag, so we need to get the parent element.
		expect(screen.getByText(/To:/).parentElement).toHaveTextContent("0x123");
		expect(screen.getByText(/Value:/).parentElement).toHaveTextContent(
			"1000 wei",
		);
		expect(screen.getByText(/Data:/).parentElement).toHaveTextContent(
			"0xdeadbeef",
		);
		expect(screen.getByText("(decode)")).toBeInTheDocument();
		expect(screen.getByText(/Operation:/).parentElement).toHaveTextContent(
			"CALL",
		);
	});

	it("shows 'No data' for empty data field", () => {
		render(<TransactionDetails details={{ ...baseDetails, data: "0x" }} />);
		// The param names are in a <strong> tag, so we need to get the parent element.
		expect(screen.getByText(/Data:/).parentElement).toHaveTextContent(
			"0x (No data)",
		);
	});

	it("shows 'DELEGATECALL' for operation 1", () => {
		render(<TransactionDetails details={{ ...baseDetails, operation: 1 }} />);
		// The param names are in a <strong> tag, so we need to get the parent element.
		expect(screen.getByText(/Operation:/).parentElement).toHaveTextContent(
			"DELEGATECALL",
		);
	});
});
