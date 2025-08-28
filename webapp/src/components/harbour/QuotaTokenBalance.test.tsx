import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const signerAddress = "0xSigner";
const quotaManagerAddress = "0xQuotaManager";
const harbourProvider = {};
const className = "test-class";

describe("QuotaTokenBalance", () => {
	beforeEach(() => {
		vi.resetModules();
	});

	it("renders token info, locked tokens, and top up form", async () => {
		vi.doMock("@/hooks/useBrowserProvider", () => ({
			useBrowserProvider: () => ({}),
		}));
		vi.doMock("@/hooks/useQuotaStats", () => ({
			useQuotaTokenStats: () => ({
				quotaTokenStats: {
					tokenInfo: {
						name: "TestToken",
						symbol: "TTK",
						address: "0x0000000000000000000000000000000000000001",
						decimals: 18,
						balance: "1000000000000000000",
					},
					lockedTokens: "500000000000000000",
				},
				isLoading: false,
			}),
		}));
		vi.doMock("../Groups", () => ({
			Box: (props: any) => <div>{props.children}</div>,
			BoxTitle: (props: any) => <div>{props.children}</div>,
		}));
		vi.doMock("../Forms", () => ({
			FormItem: (_props: any) => <div data-testid="form-item">FormItem</div>,
			SubmitItem: (_props: any) => <button type="submit">Top Up</button>,
		}));
		const { QuotaTokenBalance } = await import("./QuotaTokenBalance");
		render(
			<QuotaTokenBalance
				signerAddress={signerAddress}
				harbourProvider={harbourProvider}
				quotaManagerAddress={quotaManagerAddress}
				className={className}
			/>,
		);
		expect(screen.getByText("TestToken")).toBeInTheDocument();
		expect(screen.getByText(/0x0000…0001/)).toBeInTheDocument();
		expect(screen.getByText(/0.5 TTK/)).toBeInTheDocument();
		expect(screen.getByTestId("form-item")).toBeInTheDocument();
		expect(screen.getByText("Top Up")).toBeInTheDocument();
	});
});
