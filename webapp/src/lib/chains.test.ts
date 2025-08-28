import { describe, expect, it, vi } from "vitest";
import {
	getChainById,
	getNativeCurrencyByChainId,
	resolveChainIdFromInput,
	searchChainsByName,
} from "./chains";

// Mock chainsJson for predictable results
vi.mock("./chains.json", () => ({
	default: [
		{
			name: "Ethereum",
			chain: "ETH",
			chainId: 1,
			shortName: "eth",
			nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
			infoURL: "https://ethereum.org",
			explorers: [
				{ name: "Etherscan", url: "https://etherscan.io", standard: "EIP3091" },
			],
			rpc: [{ url: "https://mainnet.infura.io/v3/" }],
		},
		{
			name: "Polygon",
			chain: "MATIC",
			chainId: 137,
			shortName: "matic",
			nativeCurrency: { name: "Matic", symbol: "MATIC", decimals: 18 },
			infoURL: "https://polygon.technology",
			explorers: [
				{
					name: "Polygonscan",
					url: "https://polygonscan.com",
					standard: "EIP3091",
				},
			],
			rpc: [{ url: "https://polygon-rpc.com" }],
		},
	],
}));

describe("chains", () => {
	it("searchChainsByName returns correct results", () => {
		const results = searchChainsByName("Ethereum");
		expect(results.length).toBeGreaterThan(0);
		expect(results[0].name).toBe("Ethereum");
	});

	it("getChainById returns correct chain", () => {
		const chain = getChainById(1n);
		expect(chain).not.toBeNull();
		expect(chain?.name).toBe("Ethereum");
		expect(chain?.chainId).toBe(1n);
	});

	it("resolveChainIdFromInput works for chain name and id", () => {
		expect(resolveChainIdFromInput("Ethereum")).toBe(1n);
		expect(resolveChainIdFromInput("1")).toBe(1n);
		expect(resolveChainIdFromInput("Polygon")).toBe(137n);
		expect(resolveChainIdFromInput("999")).toBeNull();
		expect(resolveChainIdFromInput("UnknownChain")).toBeNull();
	});

	it("getNativeCurrencyByChainId returns correct currency", () => {
		expect(getNativeCurrencyByChainId(1n)).toEqual({
			name: "Ether",
			symbol: "ETH",
			decimals: 18,
		});
		expect(getNativeCurrencyByChainId(137n)).toEqual({
			name: "Matic",
			symbol: "MATIC",
			decimals: 18,
		});
	});
});
