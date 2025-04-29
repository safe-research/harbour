import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import type { SafeInternationalHarbour } from "../typechain-types/src/SafeInternationalHarbour";

describe("SafeInternationalHarbour", () => {
	// Fixture to deploy Safe, SafeProxyFactory, create Safe instance, and deploy SafeInternationalHarbour
	async function deployFixture() {
		const [deployer, alice] = await ethers.getSigners();
		const chainId = (await ethers.provider.getNetwork()).chainId;
		const Factory = await ethers.getContractFactory(
			"SafeInternationalHarbour",
			deployer,
		);
		const harbour = await Factory.deploy();

		const safeAddress = await alice.getAddress();
		return { deployer, alice, harbour, chainId, safeAddress };
	}

	it("should revert if signature length is not 65 bytes", async () => {
		const { deployer, harbour, chainId, safeAddress } =
			await loadFixture(deployFixture);
		await expect(
			harbour.enqueueTransaction(
				safeAddress,
				chainId,
				0, // nonce
				deployer.address, // to
				0, // value
				"0x", // data
				0, // operation
				0, // safeTxGas
				0, // baseGas
				0, // gasPrice
				ethers.ZeroAddress, // gasToken
				ethers.ZeroAddress, // refundReceiver
				"0x1234", // invalid signature
			),
		).to.be.revertedWithCustomError(harbour, "InvalidECDSASignatureLength");
	});

	it("should revert if provided signature is invalid (ecrecover yields zero address)", async () => {});
	it("should emit SignatureStored event with correct parameters on first enqueue", async () => {});
	it("should store transaction parameters on first enqueueTransaction call", async () => {});
	it("should not overwrite existing parameters on subsequent calls with same safeTxHash", async () => {});
	it("should append signature for the same signer, safe, chainId, and nonce", async () => {});
	it("should store signatures from different signers separately", async () => {});
	it("should handle duplicate enqueueTransaction calls gracefully and append duplicate signature entries", async () => {});
	it("should retrieve full transaction details via retrieveTransaction", async () => {});
	it("should return zero-initialized transaction for unknown safeTxHash", async () => {});
	it("should retrieve paginated signature entries correctly", async () => {});
	it("should return empty array for retrieveSignatures when start index >= totalCount", async () => {});
	it("should return correct total count via retrieveSignaturesCount", async () => {});
	it("should correctly store all transaction parameters", async () => {});
	it("should isolate transactions by chainId: same tx on different chainIds don't collide", async () => {});
	it("should separate signature lists by nonce: same signer and chainId, different nonces", async () => {});
	it("should isolate mappings between different Safe addresses", async () => {});
	it("should handle pagination with start > 0, count = 0, and count > totalCount", async () => {});
	it("should return zero via retrieveSignaturesCount for unknown signer/safe/chainId/nonce", async () => {});
	it("should emit listIndex correctly in SignatureStored events (monotonic index)", async () => {});
	it("should store multiple malleable signatures that recover to the same address", async () => {});
	it("should handle eth_sign prefixed signatures (v > 30 branch) correctly", async () => {});
});
