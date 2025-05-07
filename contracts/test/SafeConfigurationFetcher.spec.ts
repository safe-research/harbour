import type { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import type { Safe, SafeConfigurationFetcher } from "../typechain-types";
import type { SafeConfigurationStruct } from "../typechain-types/src/utils/SafeConfigurationFetcher.sol/SafeConfigurationFetcher";

const SENTINEL_MODULES = "0x0000000000000000000000000000000000000001";

interface TestContext {
	deployer: HardhatEthersSigner;
	fetcher: SafeConfigurationFetcher;
	safe: Safe;
	safeAddress: string;
	safeConfig: SafeConfigurationStruct;
}

/**
 * Fixture: deploys a Safe proxy with optional modules and a guard
 */
async function setupSafe(modCount = 5): Promise<TestContext> {
	const [deployer] = await ethers.getSigners();
	const SafeFactory = await ethers.getContractFactory("Safe", deployer);
	const singleton = await SafeFactory.deploy();
	const singletonAddress = await singleton.getAddress();

	const proxyFactory = await (await ethers.getContractFactory("SafeProxyFactory", deployer)).deploy();
	const fetcher = await (await ethers.getContractFactory("SafeConfigurationFetcher", deployer)).deploy();

	const owners = [deployer.address];
	for (let i = 0; i < 3; i++) owners.push(ethers.Wallet.createRandom().address);
	const threshold = 1n;

	const modules = Array.from({ length: modCount }, () => ethers.Wallet.createRandom().address);
	const fallbackHandler = ethers.Wallet.createRandom().address;

	const guard = await (await ethers.getContractFactory("DebugTransactionGuard", deployer)).deploy();
	const guardAddress = await guard.getAddress();

	const initializer = SafeFactory.interface.encodeFunctionData("setup", [
		owners,
		threshold,
		ethers.ZeroAddress,
		"0x",
		fallbackHandler,
		ethers.ZeroAddress,
		0,
		ethers.ZeroAddress,
	]);
	const saltNonce = Date.now();
	const tx = await proxyFactory.createProxyWithNonce(singletonAddress, initializer, saltNonce);
	const receipt = await tx.wait();
	if (!receipt) throw new Error("Proxy creation transaction did not return a receipt");
	const [creationEvent] = await proxyFactory.queryFilter(proxyFactory.filters.ProxyCreation(), receipt.blockNumber);
	const safeAddress = creationEvent.args.proxy;
	const safe = await ethers.getContractAt("Safe", safeAddress, deployer);

	// Enable modules if any
	for (const m of modules) {
		await execSafeTx(safe, deployer, safeAddress, safe.interface.encodeFunctionData("enableModule", [m]));
	}
	// Set guard
	await execSafeTx(safe, deployer, safeAddress, safe.interface.encodeFunctionData("setGuard", [guardAddress]));

	// Retrieve enabled modules
	const [safeModules] = await safe.getModulesPaginated(SENTINEL_MODULES, 10);

	return {
		deployer,
		fetcher,
		safe,
		safeAddress,
		safeConfig: {
			singleton: singletonAddress,
			owners,
			threshold,
			modules: safeModules,
			fallbackHandler,
			guard: guardAddress,
			nonce: await safe.nonce(),
		},
	};
}

/**
 * Executes a Safe transaction from signer
 */
async function execSafeTx(safe: Safe, signer: HardhatEthersSigner, to: string, data: string) {
	const txHash = await safe.getTransactionHash(
		to,
		0,
		data,
		0,
		0,
		0,
		0,
		ethers.ZeroAddress,
		ethers.ZeroAddress,
		await safe.nonce(),
	);
	const sig = (await signer.signMessage(ethers.getBytes(txHash))).replace(/1b$/, "1f").replace(/1c$/, "20");
	await safe.execTransaction(to, 0, data, 0, 0, 0, 0, ethers.ZeroAddress, ethers.ZeroAddress, sig);
}

/**
 * Compares actual and expected Safe configuration
 */
function assertSafeConfig(actual: SafeConfigurationStruct, expected: SafeConfigurationStruct) {
	expect(actual.singleton).to.equal(expected.singleton);
	expect(actual.owners).to.deep.equal(expected.owners);
	expect(BigInt(actual.threshold)).to.equal(BigInt(expected.threshold));
	expect(actual.fallbackHandler).to.equal(expected.fallbackHandler);
	expect(actual.guard).to.equal(expected.guard);
	expect(actual.nonce).to.equal(expected.nonce);
	expect(actual.modules).to.deep.equal(expected.modules);
}

// Add a named fixture for a Safe with no modules enabled
async function setupSafeNoModules() {
	return setupSafe(0);
}

// --- Tests ---
describe("SafeConfigurationFetcher", () => {
	let ctx: TestContext;

	beforeEach(async () => {
		ctx = await loadFixture(setupSafe);
	});

	describe("getBasicConfiguration", () => {
		it("returns correct basic configuration without modules", async () => {
			const config = await ctx.fetcher.getBasicConfiguration(ctx.safeAddress);
			assertSafeConfig(config, {
				singleton: ctx.safeConfig.singleton,
				owners: ctx.safeConfig.owners,
				threshold: ctx.safeConfig.threshold,
				fallbackHandler: ctx.safeConfig.fallbackHandler,
				guard: ctx.safeConfig.guard,
				modules: [],
				nonce: ctx.safeConfig.nonce,
			});
		});

		it("includes accurate nonce", async () => {
			await execSafeTx(ctx.safe, ctx.deployer, ctx.safeAddress, "0x");
			const current = await ctx.safe.nonce();
			const config = await ctx.fetcher.getBasicConfiguration(ctx.safeAddress);
			expect(config.nonce).to.equal(current);
		});

		it("reverts for unknown Safe", async () => {
			const fake = ethers.Wallet.createRandom().address;
			await expect(ctx.fetcher.getBasicConfiguration(fake)).to.be.reverted;
		});
	});

	describe("getModulesPaginated", () => {
		it("paginates modules correctly", async () => {
			const pageSize = 2;
			const [page1, next1] = await ctx.fetcher.getModulesPaginated(ctx.safeAddress, SENTINEL_MODULES, pageSize);
			expect(page1).to.have.length.of.at.most(pageSize);
			for (const m of page1) expect(ctx.safeConfig.modules).to.include(m);

			if (ctx.safeConfig.modules.length > pageSize) {
				expect(next1).to.not.equal(ethers.ZeroAddress);
				const [page2, next2] = await ctx.fetcher.getModulesPaginated(ctx.safeAddress, next1, pageSize);
				for (const m of page2) expect(ctx.safeConfig.modules).to.include(m);
				expect(next2).to.equal(ctx.safeConfig.modules.length > pageSize * 2 ? next2 : ethers.ZeroAddress);
			} else {
				expect(next1).to.equal(ethers.ZeroAddress);
			}
		});

		it("reverts if Safe missing", async () => {
			await expect(ctx.fetcher.getModulesPaginated(ethers.Wallet.createRandom().address, SENTINEL_MODULES, 1)).to.be
				.reverted;
		});
	});

	describe("getFullConfiguration", () => {
		it("fetches complete configuration and modules", async () => {
			const nonce = await ctx.safe.nonce();
			const [full, cursor] = await ctx.fetcher.getFullConfiguration(ctx.safeAddress, 3, 2);
			assertSafeConfig(full, {
				singleton: ctx.safeConfig.singleton,
				owners: ctx.safeConfig.owners,
				threshold: ctx.safeConfig.threshold,
				fallbackHandler: ctx.safeConfig.fallbackHandler,
				guard: ctx.safeConfig.guard,
				modules: ctx.safeConfig.modules,
				nonce,
			});
			expect(cursor).to.equal(SENTINEL_MODULES);
		});

		it("supports truncated pagination", async () => {
			if (ctx.safeConfig.modules.length <= 2) return;
			const [full, cursor] = await ctx.fetcher.getFullConfiguration(ctx.safeAddress, 1, 2);
			expect(full.modules).to.have.length.of.at.most(2);
			for (const m of full.modules) expect(ctx.safeConfig.modules).to.include(m);
			if (ctx.safeConfig.modules.length > 2) expect(cursor).to.not.equal(ethers.ZeroAddress);
		});

		it("returns no modules if none enabled", async () => {
			const emptyCtx = await loadFixture(setupSafeNoModules);
			const [full, cursor] = await emptyCtx.fetcher.getFullConfiguration(emptyCtx.safeAddress, 1, 10);
			expect(full.modules).to.be.empty;
			expect(cursor).to.equal(SENTINEL_MODULES);
		});
	});

	describe("Edge Cases", () => {
		it("rejects non safe addresses", async () => {
			const random = ethers.hexlify(ethers.randomBytes(20));
			for (const fn of [
				() => ctx.fetcher.getBasicConfiguration(random),
				() => ctx.fetcher.getModulesPaginated(random, SENTINEL_MODULES, 1),
				() => ctx.fetcher.getFullConfiguration(random, 1, 1),
			]) {
				await expect(fn()).to.be.reverted;
			}
		});

		it("invalid pageSize = 0 errors", async () => {
			await expect(ctx.fetcher.getModulesPaginated(ctx.safeAddress, SENTINEL_MODULES, 0)).to.be.reverted;
			await expect(ctx.fetcher.getFullConfiguration(ctx.safeAddress, 1, 0)).to.be.reverted;
		});
	});

	describe("Storage Helpers", () => {
		it("reads stored addresses correctly", async () => {
			const cfg = await ctx.fetcher.getBasicConfiguration(ctx.safeAddress);
			expect(cfg.singleton).to.equal(ctx.safeConfig.singleton);
			expect(cfg.fallbackHandler).to.equal(ctx.safeConfig.fallbackHandler);
			expect(cfg.guard).to.equal(ctx.safeConfig.guard);
		});
	});
});
