import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { Signature, type Signer } from "ethers";
import { ethers } from "hardhat";
import { TestCoreLib__factory } from "../typechain-types";

describe("CoreLib", () => {
	async function deployFixture() {
		const [deployer, alice, _bob] = await ethers.getSigners();
		const testCoreLibFactory = new TestCoreLib__factory(deployer as unknown as Signer);
		const testCoreLib = await testCoreLibFactory.deploy();
		return { deployer, alice: alice as unknown as Signer, testCoreLib };
	}

	it("should split vs correctly", async () => {
		const { alice, testCoreLib } = await loadFixture(deployFixture);
		const signature = Signature.from(await alice.signMessage("Test"));
		expect(await testCoreLib.testSplitSV(signature.yParityAndS)).to.be.deep.equal([
			signature.s,
			signature.yParity + 27,
		]);
	});
});
