import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import type { FieldError, UseFormRegister } from "react-hook-form";

type TransactionFormData = {
	to: string;
	value: string;
	data: string;
	nonce: string | bigint;
};

import { describe, expect, it } from "vitest";
import { TransactionFormFields } from "./TransactionFormFields";

describe("TransactionFormFields", () => {
	const register: UseFormRegister<TransactionFormData> = (name) => ({
		name,
		onChange: async () => {},
		onBlur: async () => {},
		ref: () => {},
	});
	const errors = {
		to: undefined,
		value: undefined,
		data: undefined,
		nonce: undefined,
	};
	const currentNonce = "42";

	it("renders all input fields and current nonce", () => {
		render(
			<TransactionFormFields
				register={register}
				errors={errors}
				currentNonce={currentNonce}
			/>,
		);
		expect(screen.getByLabelText(/To Address/)).toBeInTheDocument();
		expect(screen.getByLabelText(/Value \(ETH\)/)).toBeInTheDocument();
		expect(screen.getByLabelText(/Data \(Hex String\)/)).toBeInTheDocument();
		expect(screen.getByLabelText(/Nonce/)).toBeInTheDocument();
		expect(screen.getByText(/Current Safe nonce:/)).toBeInTheDocument();
		expect(screen.getByText(currentNonce)).toBeInTheDocument();
	});

	it("shows error messages for fields", () => {
		const errorsWithMessages = {
			to: { message: "Invalid address", type: "manual" } as FieldError,
			value: { message: "Invalid value", type: "manual" } as FieldError,
			data: { message: "Invalid data", type: "manual" } as FieldError,
			nonce: { message: "Invalid nonce", type: "manual" } as FieldError,
		};
		render(
			<TransactionFormFields
				register={register}
				errors={errorsWithMessages}
				currentNonce={currentNonce}
			/>,
		);
		expect(screen.getByText("Invalid address")).toBeInTheDocument();
		expect(screen.getByText("Invalid value")).toBeInTheDocument();
		expect(screen.getByText("Invalid data")).toBeInTheDocument();
		expect(screen.getByText("Invalid nonce")).toBeInTheDocument();
	});
});
