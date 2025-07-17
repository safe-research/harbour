import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { type Signer, ZeroHash } from "ethers";
import { ethers } from "hardhat";
import {
	EntryPoint__factory,
	SafeHarbourPaymaster__factory,
	SafeInternationalHarbour__factory,
} from "../typechain-types";
import { build4337Config, buildSafeTx, buildUserOp } from "./utils/erc4337";
import { buildQuotaConfig } from "./utils/quota";
import { buildSlashingConfig } from "./utils/slashing";

describe("SafeHarbourPaymaster", () => {
	async function deployFixture() {
		const [deployer, alice, bob] = await ethers.getSigners();
		const chainId = BigInt((await ethers.provider.getNetwork()).chainId);
		const EntryPointFactory = new EntryPoint__factory(deployer as unknown as Signer);
		const entryPoint = await EntryPointFactory.deploy();
		const PaymasterFactory = new SafeHarbourPaymaster__factory(deployer as unknown as Signer);
		const paymaster = await PaymasterFactory.deploy(bob, entryPoint, buildQuotaConfig(), buildSlashingConfig());
		const HarbourFactory = new SafeInternationalHarbour__factory(deployer as unknown as Signer);
		const erc4337config = build4337Config({
			entryPoint: await entryPoint.getAddress(),
			trustedPaymaster: await paymaster.getAddress(),
		});
		const harbour = await HarbourFactory.deploy(erc4337config, buildQuotaConfig());

		const safeAddress = await alice.getAddress();
		return { deployer, alice, harbour, chainId, safeAddress, entryPoint, paymaster };
	}

	const INVALID_SIG = `${"0x".padEnd(128, "a")}1f`;

	it("should revert if validatePaymasterUserOp is not called from EntryPoint", async () => {
		const { harbour, chainId, safeAddress, paymaster } = await loadFixture(deployFixture);
		const safeTx = buildSafeTx();
		const userOp = buildUserOp(harbour, safeAddress, chainId, safeTx, INVALID_SIG, 0);
		await expect(paymaster.validatePaymasterUserOp(userOp, ZeroHash, 0)).to.be.revertedWith("Sender not EntryPoint");
	});

	it("should revert if postOp is not called from EntryPoint", async () => {
		const { paymaster } = await loadFixture(deployFixture);
		await expect(paymaster.postOp(0, "0x", 0, 0)).to.be.revertedWith("Sender not EntryPoint");
	});
});
