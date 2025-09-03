import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QueueTransactionItem } from "./QueueTransactionItem";

const baseTx = {
	safeTxHash: "0xabc",
	details: {
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
	},
	signatures: [
		{
			signer: "0x456",
			r: "0x1111111111",
			vs: "0x2222222222",
			txHash: "0xabc",
		},
	],
};

const baseConfig = {
	owners: ["0x456", "0x789"],
	threshold: 2,
	fallbackHandler: "0x0",
	nonce: "1",
	guard: "0x0",
	singleton: "0x0",
	modules: [],
};

describe("QueueTransactionItem", () => {
	it("renders transaction details and signatures", () => {
		render(
			<QueueTransactionItem
				txWithSigs={baseTx}
				nonce="1"
				safeConfig={baseConfig}
				executingTxHash={null}
				executionSuccessTxHash={null}
				executionError={null}
				isExecutionPending={false}
				signingTxHash={null}
				signSuccessTxHash={null}
				signError={null}
				handleExecuteTransaction={vi.fn()}
				handleSignTransaction={vi.fn()}
			/>,
		);
		expect(screen.getByText("SafeTxHash: 0xabc")).toBeInTheDocument();
		expect(screen.queryByText("Token Balances")).toBeNull();
		expect(screen.getByText("Signatures (1 / 2):")).toBeInTheDocument();
		expect(screen.getByText(/Signer: 0x456/)).toBeInTheDocument();
	});

	it("shows sign button and warning if not enough signatures", () => {
		const tx = { ...baseTx, signatures: [] };
		render(
			<QueueTransactionItem
				txWithSigs={tx}
				nonce="1"
				safeConfig={baseConfig}
				executingTxHash={null}
				executionSuccessTxHash={null}
				executionError={null}
				isExecutionPending={false}
				signingTxHash={null}
				signSuccessTxHash={null}
				signError={null}
				handleExecuteTransaction={vi.fn()}
				handleSignTransaction={vi.fn()}
			/>,
		);
		expect(screen.getByText(/Sign Transaction/)).toBeInTheDocument();
		expect(
			screen.getByText(/Needs 2 more signatures to execute/),
		).toBeInTheDocument();
	});

	it("shows execute button if enough signatures", () => {
		const tx = {
			...baseTx,
			signatures: [
				{
					signer: "0x456",
					r: "0x1111111111",
					vs: "0x2222222222",
					txHash: "0xabc",
				},
				{
					signer: "0x789",
					r: "0x3333333333",
					vs: "0x4444444444",
					txHash: "0xabc",
				},
			],
		};
		render(
			<QueueTransactionItem
				txWithSigs={tx}
				nonce="1"
				safeConfig={baseConfig}
				executingTxHash={null}
				executionSuccessTxHash={null}
				executionError={null}
				isExecutionPending={false}
				signingTxHash={null}
				signSuccessTxHash={null}
				signError={null}
				handleExecuteTransaction={vi.fn()}
				handleSignTransaction={vi.fn()}
			/>,
		);
		expect(screen.getByText(/Execute Transaction/)).toBeInTheDocument();
	});

	it("shows loading and error/success states", () => {
		render(
			<QueueTransactionItem
				txWithSigs={baseTx}
				nonce="1"
				safeConfig={baseConfig}
				executingTxHash={"0xabc"}
				executionSuccessTxHash={null}
				executionError={{ name: "Error", message: "Failed" }}
				isExecutionPending={true}
				signingTxHash={null}
				signSuccessTxHash={null}
				signError={null}
				handleExecuteTransaction={vi.fn()}
				handleSignTransaction={vi.fn()}
			/>,
		);
		expect(screen.getByText(/Submitting transaction/)).toBeInTheDocument();
		expect(screen.getByText(/Execution failed: Failed/)).toBeInTheDocument();
	});

	it("shows success message when executionSuccessTxHash matches", () => {
		render(
			<QueueTransactionItem
				txWithSigs={baseTx}
				nonce="1"
				safeConfig={baseConfig}
				executingTxHash={null}
				executionSuccessTxHash={"0xabc"}
				executionError={null}
				isExecutionPending={false}
				signingTxHash={null}
				signSuccessTxHash={null}
				signError={null}
				handleExecuteTransaction={vi.fn()}
				handleSignTransaction={vi.fn()}
			/>,
		);
		expect(
			screen.getByText(
				/Transaction successfully submitted! Monitor your wallet for confirmation/,
			),
		).toBeInTheDocument();
	});
});
