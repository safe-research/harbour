import { createQueryClientWrapper } from "@/hooks/test-utils";
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const quotaManagerAddress = "0xQuotaManager";
const className = "test-class";

vi.mock("@web3-onboard/react", () => ({
	useConnectWallet: () => [{ wallet: null }, vi.fn()],
}));

import { QuotaOverview } from "./QuotaOverview";

describe("QuotaOverview", () => {
	it("renders the signer address input field", () => {
		render(
			<QuotaOverview
				quotaManagerAddress={quotaManagerAddress}
				className={className}
			/>,
			{ wrapper: createQueryClientWrapper() },
		);
		expect(screen.getByLabelText(/signer address/i)).toBeInTheDocument();
	});

	it("renders the refresh button", () => {
		render(
			<QuotaOverview
				quotaManagerAddress={quotaManagerAddress}
				className={className}
			/>,
			{ wrapper: createQueryClientWrapper() },
		);
		expect(
			screen.getByRole("button", { name: /refresh/i }),
		).toBeInTheDocument();
	});

	it("renders QuotaStats and QuotaTokenBalance child components", () => {
		render(
			<QuotaOverview
				quotaManagerAddress={quotaManagerAddress}
				className={className}
			/>,
			{ wrapper: createQueryClientWrapper() },
		);
		// QuotaStats and QuotaTokenBalance both render 'Token Info' and 'Available Quota' text
		expect(screen.getByText(/available quota/i)).toBeInTheDocument();
		expect(screen.getByText(/token info/i)).toBeInTheDocument();
	});
});
