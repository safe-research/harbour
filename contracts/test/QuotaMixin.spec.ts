import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import type { Signer } from "ethers";
import { ethers } from "hardhat";
import { type QuotaMixin, TestQuotaManager__factory, TestToken__factory } from "../typechain-types";
import { buildQuotaConfig, calculateNextQuotaReset, calculateNextQuotaResetFromTx } from "./utils/quota";

const WITHDRAW_REQUEST_TYPE = {
	// "WithdrawRequest(uint256 amount,address beneficiary,uint256 nonce)"
	WithdrawRequest: [
		{ type: "uint256", name: "amount" },
		{ type: "address", name: "beneficiary" },
		{ type: "uint256", name: "nonce" },
	],
};

describe("QuotaMixin", () => {
	async function deployFixture() {
		const [deployer, alice, bob] = await ethers.getSigners();
		const testTokenFactory = new TestToken__factory(deployer as unknown as Signer);
		const testToken = await testTokenFactory.deploy();
		const quotaManagerFactory = new TestQuotaManager__factory(deployer as unknown as Signer);
		const quotaConfig = buildQuotaConfig({ feeToken: await testToken.getAddress() });
		const quotaManager = await quotaManagerFactory.deploy(quotaConfig);
		return { deployer, alice: alice as unknown as Signer, bob, quotaManager, quotaManagerFactory, testToken };
	}

	async function signWithdrawal(
		wallet: Signer,
		quotaManager: QuotaMixin,
		amount: bigint,
		beneficiary: string,
		nonce = 0n,
	): Promise<string> {
		return wallet.signTypedData(
			{ chainId: (await ethers.provider.getNetwork()).chainId, verifyingContract: await quotaManager.getAddress() },
			WITHDRAW_REQUEST_TYPE,
			{ amount, beneficiary, nonce },
		);
	}

	it("should be correctly initialized", async () => {
		const { quotaManager, testToken } = await loadFixture(deployFixture);
		expect(await quotaManager.TIMEFRAME_QUOTA_RESET()).to.be.equal(24 * 3600);
		expect(await quotaManager.MAX_AVAILABLE_QUOTA()).to.be.equal(5000);
		expect(await quotaManager.QUOTA_ENABLED()).to.be.true;
		expect(await quotaManager.FEE_TOKEN()).to.be.equal(await testToken.getAddress());
		expect(await quotaManager.QUOTA_PER_FEE_TOKEN()).to.be.equal(1000);
		expect(await quotaManager.QUOTA_PER_FEE_TOKEN_SCALE()).to.be.equal(18);
	});

	it("should not have any initial free quote for signer available", async () => {
		const { alice, quotaManager } = await loadFixture(deployFixture);
		const nextResetTimestamp = calculateNextQuotaReset(BigInt(await time.latest()), 0n);
		expect(await quotaManager.availableFreeQuotaForSigner(alice)).to.be.deep.eq([0n, 0n, nextResetTimestamp]);
		expect(await quotaManager.quotaStatsForSigner(alice)).to.be.deep.eq([0n, 0n, 0n]);
	});

	it("should revert if tokens cannot be transfered for deposit", async () => {
		const { alice, quotaManager, testToken } = await loadFixture(deployFixture);
		await expect(quotaManager.depositTokensForSigner(alice, ethers.parseUnits("1", 18)))
			.to.be.revertedWithCustomError(testToken, "ERC20InsufficientAllowance")
			.withArgs(quotaManager, 0, ethers.parseUnits("1", 18));
	});

	it("should be able to deposit tokens for signer", async () => {
		const { alice, quotaManager, testToken } = await loadFixture(deployFixture);
		const nextResetTimestamp = calculateNextQuotaReset(BigInt(await time.latest()), 0n);
		expect(await quotaManager.availableFreeQuotaForSigner(alice)).to.be.deep.eq([0n, 0n, nextResetTimestamp]);
		expect(await quotaManager.quotaStatsForSigner(alice)).to.be.deep.eq([0n, 0n, 0n]);
		expect(await testToken.balanceOf(await quotaManager.getAddress())).to.be.eq(0);
		await testToken.approve(await quotaManager.getAddress(), ethers.parseUnits("1.0", 18));
		await expect(quotaManager.depositTokensForSigner(alice, ethers.parseUnits("1.0", 18)))
			.to.emit(quotaManager, "Deposit")
			.withArgs(alice, ethers.parseUnits("1", 18));
		expect(await testToken.balanceOf(await quotaManager.getAddress())).to.be.eq(ethers.parseUnits("1", 18));
		const nextResetTimestamp2 = await calculateNextQuotaReset(BigInt(await time.latest()), 0n);
		expect(await quotaManager.availableFreeQuotaForSigner(alice)).to.be.deep.eq([
			1000n, // Available Free Signer Quota
			0n, // Used Signer Quote
			nextResetTimestamp2, // Next Signer Quota Reset
		]);
		expect(await quotaManager.quotaStatsForSigner(alice)).to.be.deep.eq([
			ethers.parseUnits("1", 18), // Signer Token Balance
			0n, // Used Signer Quota
			0n, // Next Signer Quota Reset
		]);
	});

	it("should revert if deposited tokens result in too high quota", async () => {
		const { deployer, alice, testToken, quotaManagerFactory } = await loadFixture(deployFixture);
		// Deploy QuotaManager with adjusted scale
		const quotaConfig = buildQuotaConfig({ feeToken: await testToken.getAddress(), quotaPerFeeTokenScale: 0 });
		const quotaManager = await quotaManagerFactory.deploy(quotaConfig);
		const maxUInt96 = BigInt("0xffffffffffffffffffffffff");
		await testToken.mint(deployer, maxUInt96);
		await testToken.approve(await quotaManager.getAddress(), maxUInt96);
		await quotaManager.depositTokensForSigner(alice, maxUInt96);
		expect(await testToken.balanceOf(await quotaManager.getAddress())).to.be.eq(maxUInt96);
		expect(await quotaManager.quotaStatsForSigner(alice)).to.be.deep.eq([
			maxUInt96, // Signer Token Balance
			0n, // Used Signer Quota
			0n, // Next Signer Quota Reset
		]);
		await expect(quotaManager.checkAndUpdateQuota(alice, 100)).to.be.revertedWith("Max signer quota too high");
	});

	it("should max out available quote for signer", async () => {
		const { alice, quotaManager, testToken } = await loadFixture(deployFixture);
		const nextResetTimestamp = calculateNextQuotaReset(BigInt(await time.latest()), 0n);
		expect(await quotaManager.availableFreeQuotaForSigner(alice)).to.be.deep.eq([0n, 0n, nextResetTimestamp]);
		expect(await quotaManager.quotaStatsForSigner(alice)).to.be.deep.eq([0n, 0n, 0n]);
		expect(await testToken.balanceOf(await quotaManager.getAddress())).to.be.eq(0);
		await testToken.approve(await quotaManager.getAddress(), ethers.parseUnits("1000", 18));
		const updateTx = await quotaManager.depositTokensForSigner(alice, ethers.parseUnits("1000", 18));
		expect(await testToken.balanceOf(await quotaManager.getAddress())).to.be.eq(ethers.parseUnits("1000", 18));
		const nextResetTimestamp2 = await calculateNextQuotaResetFromTx(updateTx, 0n);
		expect(await quotaManager.availableFreeQuotaForSigner(alice)).to.be.deep.eq([
			5000n, // Available Free Signer Quota
			0n, // Used Signer Quote
			nextResetTimestamp2, // Next Signer Quota Reset
		]);
		expect(await quotaManager.quotaStatsForSigner(alice)).to.be.deep.eq([
			ethers.parseUnits("1000", 18), // Signer Token Balance
			0n, // Used Signer Quota
			0n, // Next Signer Quota Reset
		]);
	});

	it("should be able to withdraw tokens if quota was not used", async () => {
		const { alice, bob, quotaManager, testToken } = await loadFixture(deployFixture);
		expect(await quotaManager.quotaStatsForSigner(alice)).to.be.deep.eq([0n, 0n, 0n]);
		expect(await testToken.balanceOf(await quotaManager.getAddress())).to.be.eq(0);
		await testToken.approve(await quotaManager.getAddress(), ethers.parseUnits("1000", 18));
		await quotaManager.depositTokensForSigner(alice, ethers.parseUnits("1000", 18));
		expect(await testToken.balanceOf(await quotaManager.getAddress())).to.be.eq(ethers.parseUnits("1000", 18));
		expect(await quotaManager.quotaStatsForSigner(alice)).to.be.deep.eq([
			ethers.parseUnits("1000", 18), // Signer Token Balance
			0n, // Used Signer Quota
			0n, // Next Signer Quota Reset
		]);
		expect(await testToken.balanceOf(bob.address)).to.be.eq(0);
		const sig = await signWithdrawal(alice, quotaManager, ethers.parseUnits("500", 18), bob.address);
		await expect(quotaManager.widthdrawTokensForSigner(sig, ethers.parseUnits("500", 18), bob, 0))
			.to.emit(quotaManager, "Withdraw")
			.withArgs(alice, ethers.parseUnits("500", 18));
		expect(await testToken.balanceOf(await quotaManager.getAddress())).to.be.eq(ethers.parseUnits("500", 18));
		expect(await testToken.balanceOf(bob.address)).to.be.eq(ethers.parseUnits("500", 18));
		expect(await quotaManager.quotaStatsForSigner(alice)).to.be.deep.eq([
			ethers.parseUnits("500", 18), // Signer Token Balance
			0n, // Used Signer Quota
			0n, // Next Signer Quota Reset
		]);
	});

	it("should revert if same signature is used twice for withdraw", async () => {
		const { alice, bob, quotaManager, testToken } = await loadFixture(deployFixture);
		await testToken.approve(await quotaManager.getAddress(), ethers.parseUnits("1000", 18));
		await quotaManager.depositTokensForSigner(alice, ethers.parseUnits("1000", 18));
		const sig = await signWithdrawal(alice, quotaManager, ethers.parseUnits("500", 18), bob.address);
		await quotaManager.widthdrawTokensForSigner(sig, ethers.parseUnits("500", 18), bob, 0);
		expect(await quotaManager.quotaStatsForSigner(alice)).to.be.deep.eq([
			ethers.parseUnits("500", 18), // Signer Token Balance
			0n, // Used Signer Quota
			0n, // Next Signer Quota Reset
		]);

		await expect(quotaManager.widthdrawTokensForSigner(sig, ethers.parseUnits("500", 18), bob, 0)).to.be.revertedWith(
			"Withdrawal was already performed",
		);
		expect(await quotaManager.quotaStatsForSigner(alice)).to.be.deep.eq([
			ethers.parseUnits("500", 18), // Signer Token Balance
			0n, // Used Signer Quota
			0n, // Next Signer Quota Reset
		]);
	});

	it("should be able to withdraw multiple times", async () => {
		const { alice, bob, quotaManager, testToken } = await loadFixture(deployFixture);
		await testToken.approve(await quotaManager.getAddress(), ethers.parseUnits("1000", 18));
		await quotaManager.depositTokensForSigner(alice, ethers.parseUnits("1000", 18));
		const sig = await signWithdrawal(alice, quotaManager, ethers.parseUnits("500", 18), bob.address);
		await quotaManager.widthdrawTokensForSigner(sig, ethers.parseUnits("500", 18), bob, 0);
		expect(await quotaManager.quotaStatsForSigner(alice)).to.be.deep.eq([
			ethers.parseUnits("500", 18), // Signer Token Balance
			0n, // Used Signer Quota
			0n, // Next Signer Quota Reset
		]);

		const sig2 = await signWithdrawal(alice, quotaManager, ethers.parseUnits("500", 18), bob.address, 23n);
		await quotaManager.widthdrawTokensForSigner(sig2, ethers.parseUnits("500", 18), bob, 23n);
		expect(await quotaManager.quotaStatsForSigner(alice)).to.be.deep.eq([
			0n, // Signer Token Balance
			0n, // Used Signer Quota
			0n, // Next Signer Quota Reset
		]);
	});

	it("should revert if too many tokens are withdrawn", async () => {
		const { alice, bob, quotaManager, testToken } = await loadFixture(deployFixture);
		await testToken.approve(await quotaManager.getAddress(), ethers.parseUnits("1", 18));
		await quotaManager.depositTokensForSigner(alice, ethers.parseUnits("1", 18));
		const sig = await signWithdrawal(alice, quotaManager, ethers.parseUnits("500", 18), bob.address);
		await expect(quotaManager.widthdrawTokensForSigner(sig, ethers.parseUnits("2", 18), bob, 0)).to.be.revertedWith(
			"Insufficient Tokens",
		);
	});

	it("should revert if signature for different amount is used", async () => {
		const { alice, bob, quotaManager, testToken } = await loadFixture(deployFixture);
		await testToken.approve(await quotaManager.getAddress(), ethers.parseUnits("1", 18));
		await quotaManager.depositTokensForSigner(alice, ethers.parseUnits("1", 18));
		const sig = await signWithdrawal(alice, quotaManager, ethers.parseUnits("500", 18), bob.address);
		await expect(quotaManager.widthdrawTokensForSigner(sig, ethers.parseUnits("1", 18), bob, 0)).to.be.revertedWith(
			"Insufficient Tokens",
		);
	});

	it("should revert if signature for different domain is used", async () => {
		const { alice, bob, quotaManager, testToken } = await loadFixture(deployFixture);
		await testToken.approve(await quotaManager.getAddress(), ethers.parseUnits("1", 18));
		await quotaManager.depositTokensForSigner(alice, ethers.parseUnits("1", 18));
		const sig = await signWithdrawal(alice, quotaManager, ethers.parseUnits("500", 18), bob.address);
		await expect(quotaManager.widthdrawTokensForSigner(sig, ethers.parseUnits("1", 18), bob, 0)).to.be.revertedWith(
			"Insufficient Tokens",
		);
	});

	it("should revert if not tokens deposited", async () => {
		const { alice, quotaManager } = await loadFixture(deployFixture);
		await expect(quotaManager.checkAndUpdateQuota(alice, 100)).to.be.revertedWithCustomError(
			quotaManager,
			"TestOverQuota",
		);
	});

	it("should be able to spend quota", async () => {
		const { alice, quotaManager, testToken } = await loadFixture(deployFixture);
		expect(await quotaManager.quotaStatsForSigner(alice)).to.be.deep.eq([0n, 0n, 0n]);
		expect(await testToken.balanceOf(await quotaManager.getAddress())).to.be.eq(0);
		await testToken.approve(await quotaManager.getAddress(), ethers.parseUnits("5", 18));
		await quotaManager.depositTokensForSigner(alice, ethers.parseUnits("5", 18));
		expect(await testToken.balanceOf(await quotaManager.getAddress())).to.be.eq(ethers.parseUnits("5", 18));
		expect(await quotaManager.quotaStatsForSigner(alice)).to.be.deep.eq([
			ethers.parseUnits("5", 18), // Signer Token Balance
			0n, // Used Signer Quota
			0n, // Next Signer Quota Reset
		]);
		const updateTx = await quotaManager.checkAndUpdateQuota(alice, 100);
		const nextQuotaReset = await calculateNextQuotaResetFromTx(updateTx, 0n);

		expect(await quotaManager.quotaStatsForSigner(alice)).to.be.deep.eq([
			ethers.parseUnits("5", 18), // Signer Token Balance
			100n, // Used Signer Quota
			nextQuotaReset, // Next Signer Quota Reset
		]);
	});

	it("should be able to spend quota in multiple interactions in the same reset timeframe", async () => {
		const { alice, quotaManager, testToken } = await loadFixture(deployFixture);
		expect(await quotaManager.quotaStatsForSigner(alice)).to.be.deep.eq([0n, 0n, 0n]);
		expect(await testToken.balanceOf(await quotaManager.getAddress())).to.be.eq(0);
		await testToken.approve(await quotaManager.getAddress(), ethers.parseUnits("5", 18));
		await quotaManager.depositTokensForSigner(alice, ethers.parseUnits("5", 18));
		expect(await testToken.balanceOf(await quotaManager.getAddress())).to.be.eq(ethers.parseUnits("5", 18));
		expect(await quotaManager.quotaStatsForSigner(alice)).to.be.deep.eq([
			ethers.parseUnits("5", 18), // Signer Token Balance
			0n, // Used Signer Quota
			0n, // Next Signer Quota Reset
		]);
		const updateTx = await quotaManager.checkAndUpdateQuota(alice, 100);
		const nextQuotaReset = await calculateNextQuotaResetFromTx(updateTx, 0n);

		expect(await quotaManager.quotaStatsForSigner(alice)).to.be.deep.eq([
			ethers.parseUnits("5", 18), // Signer Token Balance
			100n, // Used Signer Quota
			nextQuotaReset, // Next Signer Quota Reset
		]);

		await quotaManager.checkAndUpdateQuota(alice, 200);
		expect(await quotaManager.quotaStatsForSigner(alice)).to.be.deep.eq([
			ethers.parseUnits("5", 18), // Signer Token Balance
			300n, // Used Signer Quota
			nextQuotaReset, // Next Signer Quota Reset
		]);

		await quotaManager.checkAndUpdateQuota(alice, 2000);
		expect(await quotaManager.quotaStatsForSigner(alice)).to.be.deep.eq([
			ethers.parseUnits("5", 18), // Signer Token Balance
			2300n, // Used Signer Quota
			nextQuotaReset, // Next Signer Quota Reset
		]);
	});

	it("should revert if not enough quota", async () => {
		const { alice, quotaManager, testToken } = await loadFixture(deployFixture);
		expect(await quotaManager.quotaStatsForSigner(alice)).to.be.deep.eq([0n, 0n, 0n]);
		expect(await testToken.balanceOf(await quotaManager.getAddress())).to.be.eq(0);
		await testToken.approve(await quotaManager.getAddress(), ethers.parseUnits("5", 18));
		await quotaManager.depositTokensForSigner(alice, ethers.parseUnits("5", 18));
		expect(await testToken.balanceOf(await quotaManager.getAddress())).to.be.eq(ethers.parseUnits("5", 18));
		expect(await quotaManager.quotaStatsForSigner(alice)).to.be.deep.eq([
			ethers.parseUnits("5", 18), // Signer Token Balance
			0n, // Used Signer Quota
			0n, // Next Signer Quota Reset
		]);
		const updateTx = await quotaManager.checkAndUpdateQuota(alice, 5000);
		const nextQuotaReset = await calculateNextQuotaResetFromTx(updateTx, 0n);

		expect(await quotaManager.quotaStatsForSigner(alice)).to.be.deep.eq([
			ethers.parseUnits("5", 18), // Signer Token Balance
			5000n, // Used Signer Quota
			nextQuotaReset, // Next Signer Quota Reset
		]);
		await expect(quotaManager.checkAndUpdateQuota(alice, 1)).to.be.revertedWithCustomError(
			quotaManager,
			"TestOverQuota",
		);
	});

	it("cannot withdraw if any quota has been used", async () => {
		const { alice, bob, quotaManager, testToken } = await loadFixture(deployFixture);
		await testToken.approve(await quotaManager.getAddress(), ethers.parseUnits("5", 18));
		await quotaManager.depositTokensForSigner(alice, ethers.parseUnits("5", 18));

		await quotaManager.checkAndUpdateQuota(alice, 1);
		const sig = await signWithdrawal(alice, quotaManager, ethers.parseUnits("1", 18), bob.address);
		await expect(quotaManager.widthdrawTokensForSigner(sig, ethers.parseUnits("1", 18), bob, 0)).to.be.revertedWith(
			"Tokens have been used during this timeframe",
		);
	});

	it("should be able to use quota after reset", async () => {
		const { alice, quotaManager, testToken } = await loadFixture(deployFixture);
		expect(await quotaManager.quotaStatsForSigner(alice)).to.be.deep.eq([0n, 0n, 0n]);
		expect(await testToken.balanceOf(await quotaManager.getAddress())).to.be.eq(0);
		await testToken.approve(await quotaManager.getAddress(), ethers.parseUnits("5", 18));
		await quotaManager.depositTokensForSigner(alice, ethers.parseUnits("5", 18));
		expect(await testToken.balanceOf(await quotaManager.getAddress())).to.be.eq(ethers.parseUnits("5", 18));
		expect(await quotaManager.quotaStatsForSigner(alice)).to.be.deep.eq([
			ethers.parseUnits("5", 18), // Signer Token Balance
			0n, // Used Signer Quota
			0n, // Next Signer Quota Reset
		]);
		const updateTx = await quotaManager.checkAndUpdateQuota(alice, 5000);
		const nextQuotaReset = await calculateNextQuotaResetFromTx(updateTx, 0n);

		expect(await quotaManager.availableFreeQuotaForSigner(alice)).to.be.deep.eq([
			0n, // Signer Token Balance
			5000n, // Used Signer Quota
			nextQuotaReset, // Next Signer Quota Reset
		]);
		const newTime = await time.increase(24 * 3600);
		const nextQuotaReset2 = calculateNextQuotaReset(BigInt(newTime), nextQuotaReset);

		expect(await quotaManager.availableFreeQuotaForSigner(alice)).to.be.deep.eq([
			5000n, // Signer Token Balance
			0n, // Used Signer Quota
			nextQuotaReset2, // Next Signer Quota Reset
		]);

		const updateTx2 = await quotaManager.checkAndUpdateQuota(alice, 4000);
		const nextQuotaReset3 = await calculateNextQuotaResetFromTx(updateTx2, 0n);

		expect(await quotaManager.quotaStatsForSigner(alice)).to.be.deep.eq([
			ethers.parseUnits("5", 18), // Signer Token Balance
			4000n, // Used Signer Quota
			nextQuotaReset3, // Next Signer Quota Reset
		]);
	});

	it("should be able to widthdraw after reset", async () => {
		const { alice, bob, quotaManager, testToken } = await loadFixture(deployFixture);
		expect(await quotaManager.quotaStatsForSigner(alice)).to.be.deep.eq([0n, 0n, 0n]);
		expect(await testToken.balanceOf(await quotaManager.getAddress())).to.be.eq(0);
		await testToken.approve(await quotaManager.getAddress(), ethers.parseUnits("5", 18));
		await quotaManager.depositTokensForSigner(alice, ethers.parseUnits("5", 18));
		expect(await testToken.balanceOf(await quotaManager.getAddress())).to.be.eq(ethers.parseUnits("5", 18));
		expect(await quotaManager.quotaStatsForSigner(alice)).to.be.deep.eq([
			ethers.parseUnits("5", 18), // Signer Token Balance
			0n, // Used Signer Quota
			0n, // Next Signer Quota Reset
		]);
		const updateTx = await quotaManager.checkAndUpdateQuota(alice, 5000);
		const nextQuotaReset = await calculateNextQuotaResetFromTx(updateTx, 0n);
		expect(await quotaManager.quotaStatsForSigner(alice)).to.be.deep.eq([
			ethers.parseUnits("5", 18), // Signer Token Balance
			5000n, // Used Signer Quota
			nextQuotaReset, // Next Signer Quota Reset
		]);

		const sig = await signWithdrawal(alice, quotaManager, ethers.parseUnits("1", 18), bob.address);
		await expect(quotaManager.widthdrawTokensForSigner(sig, ethers.parseUnits("1", 18), bob, 0)).to.be.revertedWith(
			"Tokens have been used during this timeframe",
		);

		const newTime = await time.increase(24 * 3600);
		await quotaManager.widthdrawTokensForSigner(sig, ethers.parseUnits("1", 18), bob, 0);
		const nextQuotaReset2 = calculateNextQuotaReset(BigInt(newTime), 0n);
		// Withdraw does not update quota stats
		expect(await quotaManager.quotaStatsForSigner(alice)).to.be.deep.eq([
			ethers.parseUnits("4", 18), // Signer Token Balance
			5000n, // Used Signer Quota
			nextQuotaReset, // Next Signer Quota Reset
		]);
		expect(await quotaManager.availableFreeQuotaForSigner(alice)).to.be.deep.eq([4000n, 0n, nextQuotaReset2]);
	});
});
