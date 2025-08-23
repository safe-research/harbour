import { beforeEach, describe, expect, it, vi } from "vitest";

/** Mock the dependencies BEFORE importing the module under test */
vi.mock("@web3-onboard/injected-wallets", () => {
	const injectedModule = vi.fn(() => ({ label: "injected-wallets-mock" }));
	return { default: injectedModule };
});

vi.mock("@web3-onboard/react", () => {
	return { init: vi.fn(() => ({})) };
});

type OnboardInitArg = {
	wallets: ReadonlyArray<unknown>;
	chains: ReadonlyArray<{
		id: string;
		token: string;
		label: string;
		rpcUrl: string;
	}>;
	connect?: { autoConnectLastWallet?: boolean };
};

beforeEach(() => {
	vi.clearAllMocks();
	vi.resetModules(); // ensure fresh module execution per test
});

describe("web3-onboard init module", () => {
	it("initializes with injected wallets and Gnosis Chain config", async () => {
		const { default: injectedModule } = await import(
			"@web3-onboard/injected-wallets"
		);
		const { init } = await import("@web3-onboard/react");

		// Import the module under test (triggers init() once)
		await import("./onboard");

		expect(injectedModule).toHaveBeenCalledTimes(1);
		expect(init).toHaveBeenCalledTimes(1);

		// Grab the first call arg and assert structure/values
		const initCalls = vi.mocked(init).mock.calls;
		const config = initCalls[0][0] as OnboardInitArg;

		expect(config.connect?.autoConnectLastWallet).toBe(true);

		// One wallet: our mocked injected wallet instance
		expect(config.wallets).toHaveLength(1);
		expect(config.wallets[0]).toEqual({ label: "injected-wallets-mock" });

		// Chain config: Gnosis (0x64)
		expect(config.chains).toHaveLength(1);
		expect(config.chains[0]).toEqual({
			id: "0x64",
			token: "XDAI",
			label: "Gnosis Chain",
			rpcUrl: "https://rpc.gnosischain.com",
		});
	});

	it("does not re-initialize on repeated imports (module cache)", async () => {
		const { init } = await import("@web3-onboard/react");

		await import("./onboard"); // first import triggers init()
		expect(init).toHaveBeenCalledTimes(1);

		await import("./onboard"); // second import uses cache; no new call
		expect(init).toHaveBeenCalledTimes(1);
	});
});
