import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { randomX25519KeyPair } from "./utils/encryption";

describe("SafeInternationalHarbour", () => {
	async function deployFixture() {
		const [deployer, signer, alice] = await ethers.getSigners();
		const Factory = await ethers.getContractFactory("SafeSecretHarbour");
		const harbour = await Factory.deploy();

		const { decryptionKey, encryptionKey } = await randomX25519KeyPair();

		return { deployer, signer, alice, harbour, decryptionKey, encryptionKey };
	}

	it("should register a public encryption key", async () => {
		const { signer, harbour, encryptionKey } = await loadFixture(deployFixture);

		await harbour.connect(signer).registerEncryptionKey(encryptionKey);
		const [storedEncryptionKey] = await harbour.retrieveEncryptionKeys([signer]);
		expect(storedEncryptionKey).to.equal(encryptionKey);
	});

	it("should emit a key registration event", async () => {
		const { signer, harbour, encryptionKey } = await loadFixture(deployFixture);

		await expect(harbour.connect(signer).registerEncryptionKey(encryptionKey))
			.to.emit(harbour, "EncryptionKeyRegistered")
			.withArgs(signer.address, encryptionKey);
	});

	it("should be able to retrieve a public encryption keys for multiple signers at a time", async () => {
		const { signer, alice, harbour, encryptionKey } = await loadFixture(deployFixture);

		const signers = [];
		const keys = [];
		for (const { account, key } of [
			{ account: signer, key: encryptionKey },
			{ account: alice, key: ethers.id("alice") },
		]) {
			await harbour.connect(account).registerEncryptionKey(key);

			signers.push(account.address);
			keys.push(key);
		}

		expect(await harbour.retrieveEncryptionKeys(signers)).to.deep.equal(keys);
	});
});
