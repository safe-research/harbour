import { describe, expect, it } from "vitest";
import {
	canUseWalletConnect,
	isEthSendTransaction,
	type WalletKitTypes,
	walletConnectUriSchema,
} from "./walletconnect";

describe("walletconnect", () => {
	it("isEthSendTransaction returns true for eth_sendTransaction", () => {
		const event = {
			params: { request: { method: "eth_sendTransaction" } },
		} as unknown as WalletKitTypes.SessionRequest;
		expect(isEthSendTransaction(event)).toBe(true);
	});

	it("isEthSendTransaction returns false for other methods", () => {
		const event = {
			params: { request: { method: "eth_sign" } },
		} as unknown as WalletKitTypes.SessionRequest;
		expect(isEthSendTransaction(event)).toBe(false);
	});

	it("canUseWalletConnect returns a boolean", () => {
		expect(typeof canUseWalletConnect()).toBe("boolean");
	});

	it("walletConnectUriSchema validates correct URI", () => {
		expect(() =>
			walletConnectUriSchema.parse(
				"wc:abc123@2?bridge=https://bridge.walletconnect.org&key=xyz",
			),
		).not.toThrow();
	});

	it("walletConnectUriSchema throws for invalid URI", () => {
		expect(() =>
			walletConnectUriSchema.parse(
				"wc:abc123@1?bridge=https://bridge.walletconnect.org&key=xyz",
			),
		).toThrow();
		expect(() =>
			walletConnectUriSchema.parse(
				"notwc:abc123@2?bridge=https://bridge.walletconnect.org&key=xyz",
			),
		).toThrow();
	});
});
