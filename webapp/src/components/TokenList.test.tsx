import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TokenList } from "./TokenList";

describe("TokenList", () => {
	const tokens = [
		{
			address: "0x1",
			name: "TokenA",
			symbol: "TKA",
			decimals: 18,
			balance: 1000000000000000000n, // 1 TKA
		},
		{
			address: "0x2",
			name: "TokenB",
			symbol: "TKB",
			decimals: 6,
			balance: 0n,
		},
	];

	it("renders token names, symbols, and balances", () => {
		render(
			<TokenList
				tokens={tokens}
				onSendToken={() => {}}
				onRemoveToken={() => {}}
			/>,
		);
		expect(screen.getByText("TokenA (TKA)")).toBeInTheDocument();
		expect(screen.getByText("TokenB (TKB)")).toBeInTheDocument();
		expect(screen.getByText("1.0")).toBeInTheDocument();
		expect(screen.getByText("0.0")).toBeInTheDocument();
	});

	it("shows empty message when no tokens", () => {
		render(
			<TokenList tokens={[]} onSendToken={() => {}} onRemoveToken={() => {}} />,
		);
		expect(screen.getByText("No ERC20 tokens added yet.")).toBeInTheDocument();
	});

	it("calls onSendToken and onRemoveToken when buttons clicked", () => {
		const onSendToken = vi.fn();
		const onRemoveToken = vi.fn();
		render(
			<TokenList
				tokens={tokens}
				onSendToken={onSendToken}
				onRemoveToken={onRemoveToken}
			/>,
		);
		// SendButton for TokenA (enabled)
		fireEvent.click(screen.getAllByRole("button")[0]);
		expect(onSendToken).toHaveBeenCalledWith("0x1");
		// RemoveButton for TokenA
		fireEvent.click(screen.getAllByLabelText("Remove token")[0]);
		expect(onRemoveToken).toHaveBeenCalledWith("0x1");
	});

	it("disables SendButton for tokens with zero balance", () => {
		render(
			<TokenList
				tokens={tokens}
				onSendToken={() => {}}
				onRemoveToken={() => {}}
			/>,
		);
		// Find the SendButton for TokenB (should be disabled)
		const sendButtons = screen.getAllByRole("button", { name: "Send" });
		expect(sendButtons[1]).toBeDisabled();
	});
});
