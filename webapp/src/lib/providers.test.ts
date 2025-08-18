import { describe, it, expect, vi } from "vitest";
import type { JsonRpcApiProvider } from "ethers";
import { getEIP1193ProviderFromRPCProvider } from "./providers";

describe("providers", () => {
	it("forwards method and params, returning the provider result", async () => {
		const send = vi.fn().mockResolvedValue("0x64"); // Gnosis chainId
		const rpc = { send } as unknown as JsonRpcApiProvider;

		const eip1193 = getEIP1193ProviderFromRPCProvider(rpc);
		const res = await eip1193.request({ method: "eth_chainId", params: [] });

		expect(res).toBe("0x64");
		expect(send).toHaveBeenCalledTimes(1);
		expect(send).toHaveBeenCalledWith("eth_chainId", []);
	});

	it("passes through the same params reference", async () => {
		const params = [{ to: "0x0", data: "0x" }, "latest"];
		const send = vi.fn().mockResolvedValue("ok");
		const rpc = { send } as unknown as JsonRpcApiProvider;

		const eip1193 = getEIP1193ProviderFromRPCProvider(rpc);
		await eip1193.request({ method: "eth_call", params } as any);

		// Grab the params passed to send and ensure it's the same array instance
		const [, passedParams] = send.mock.calls[0];
		expect(passedParams).toBe(params);
	});

	it("propagates errors from provider.send", async () => {
		const err = new Error("error");
		const send = vi.fn().mockRejectedValue(err);
		const rpc = { send } as unknown as JsonRpcApiProvider;

		const eip1193 = getEIP1193ProviderFromRPCProvider(rpc);
		await expect(
			eip1193.request({ method: "eth_chainId" } as any),
		).rejects.toThrow("error");
	});
});
