import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuotaStats } from "./QuotaStats";

const mockQuotaStats = {
	availableFreeQuota: 100,
	usedSignerQuota: 50,
	nextSignerQuotaReset: 1700000000,
};

const mockUseQuotaStats = vi.fn(() => ({
	quotaStats: mockQuotaStats,
	isLoading: false,
	refresh: vi.fn(),
}));

vi.mock("@/hooks/useQuotaStats", () => ({
	useQuotaStats: () => mockUseQuotaStats(),
}));

describe("QuotaStats", () => {
	it("renders quota stats correctly", () => {
		render(
			<QuotaStats
				signerAddress="0x123"
				harbourProvider={null}
				quotaManagerAddress="0x456"
			/>,
		);
		expect(screen.getByText("Available Quota")).toBeInTheDocument();
		expect(screen.getByText("Used Quota")).toBeInTheDocument();
		expect(screen.getByText("Next Reset")).toBeInTheDocument();
		expect(screen.getByText("100")).toBeInTheDocument();
		expect(screen.getByText("50")).toBeInTheDocument();
		expect(
			screen.getByText(
				new Date(mockQuotaStats.nextSignerQuotaReset * 1000).toLocaleString(),
			),
		).toBeInTheDocument();
	});

	it("shows loading state", () => {
		mockUseQuotaStats.mockImplementationOnce(() => ({
			quotaStats: mockQuotaStats,
			isLoading: true,
			refresh: vi.fn(),
		}));
		render(
			<QuotaStats
				signerAddress="0x123"
				harbourProvider={null}
				quotaManagerAddress="0x456"
			/>,
		);
		expect(screen.getAllByText("-").length).toBe(3); // dash is displayed when loading. 3 quota stats -> 3 dashes
	});
});
