import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import type { BlockIndices } from "../typechain-types/src/test/TestBlockIndices";

describe("BlockIndices", () => {
	async function deployFixture() {
		const testBlockIndicesFactory = await ethers.getContractFactory("TestBlockIndices");
		const testBlockIndices = await testBlockIndicesFactory.deploy();
		const appendN = async (n: number) => {
			for (let i = 1; i <= n; i++) {
				await testBlockIndices.testAppend(i);
			}
		};
		return { testBlockIndices, appendN };
	}

	// NOTE: Ethers.js edits struct arguments passed to functions in place, but returns them as
	// read-only. As a work-around, copy returned iterator structures so they can be used as
	// function parameters for other calls.
	function cp(it: BlockIndices.IteratorStructOutput) {
		return [...it] as unknown as BlockIndices.IteratorStruct;
	}

	it("should return the length of indices", async () => {
		const { testBlockIndices, appendN } = await loadFixture(deployFixture);
		await appendN(13);
		expect(await testBlockIndices.testLen()).to.equal(13);
	});

	it("should create an empty iterator for an empty list", async () => {
		const { testBlockIndices } = await loadFixture(deployFixture);
		const it = await testBlockIndices.testIter();
		expect(await testBlockIndices.testCount(cp(it))).to.equal(0);
		const [, remaining] = await testBlockIndices.testNext(cp(it));
		expect(remaining).to.be.false;
	});

	it("should iterate over lists", async () => {
		const { testBlockIndices, appendN } = await loadFixture(deployFixture);
		await appendN(13);
		let it = await testBlockIndices.testIter();
		let remaining: boolean;
		for (let i = 1; i <= 13; i++) {
			[it, remaining] = await testBlockIndices.testNext(cp(it));
			expect(remaining).to.be.true;
			expect(await testBlockIndices.testValue(cp(it))).to.equal(i);
		}
		[, remaining] = await testBlockIndices.testNext(cp(it));
		expect(remaining).to.be.false;
	});

	it("should skip over items lists", async () => {
		const { testBlockIndices, appendN } = await loadFixture(deployFixture);
		await appendN(13);
		const it = await testBlockIndices.testIter();

		const it1 = await testBlockIndices.testSkip(cp(it), 2);
		const [it2, remaining2] = await testBlockIndices.testNext(cp(it1));
		expect(remaining2).to.be.true;
		expect(await testBlockIndices.testValue(cp(it2))).to.equal(3);

		const it8 = await testBlockIndices.testSkip(cp(it), 9);
		const [it9, remaining9] = await testBlockIndices.testNext(cp(it8));
		expect(remaining9).to.be.true;
		expect(await testBlockIndices.testValue(cp(it9))).to.equal(10);
	});

	it("should allow skipping no items", async () => {
		const { testBlockIndices, appendN } = await loadFixture(deployFixture);
		await appendN(1);
		const itA = await testBlockIndices.testIter();
		const itB = await testBlockIndices.testSkip(cp(itA), 0);
		expect(cp(itA)).to.deep.equal(cp(itB));
	});

	it("should allow skipping all items", async () => {
		const { testBlockIndices, appendN } = await loadFixture(deployFixture);
		await appendN(1);
		const it = await testBlockIndices.testIter();

		const it0 = await testBlockIndices.testSkip(cp(it), 1);
		expect(await testBlockIndices.testCount(cp(it0))).to.equal(0);
		const [, remaining1] = await testBlockIndices.testNext(cp(it0));
		expect(remaining1).to.be.false;

		const it99 = await testBlockIndices.testSkip(cp(it), 100);
		expect(await testBlockIndices.testCount(cp(it99))).to.equal(0);
		const [, remaining99] = await testBlockIndices.testNext(cp(it99));
		expect(remaining99).to.be.false;
	});

	it("should take some items", async () => {
		const { testBlockIndices, appendN } = await loadFixture(deployFixture);
		await appendN(5);
		const it = await testBlockIndices.testIter();

		const it2 = await testBlockIndices.testTake(cp(it), 2);
		expect(await testBlockIndices.testCount(cp(it2))).to.equal(2);
		const [it2_0, remaining2_0] = await testBlockIndices.testNext(cp(it2));
		expect(remaining2_0).to.be.true;
		expect(await testBlockIndices.testValue(cp(it2_0))).to.equal(1);

		const it99 = await testBlockIndices.testTake(cp(it), 99);
		expect(await testBlockIndices.testCount(cp(it99))).to.equal(5);
		const [it99_0, remaining99_0] = await testBlockIndices.testNext(cp(it99));
		expect(remaining99_0).to.be.true;
		expect(await testBlockIndices.testValue(cp(it99_0))).to.equal(1);
	});

	it("should collect items from a starting point and count", async () => {
		const { testBlockIndices, appendN } = await loadFixture(deployFixture);
		await appendN(100);
		const blockIndices = await testBlockIndices.testSlice(17, 12);
		expect(blockIndices).to.deep.equal([...Array(12)].map((_, i) => i + 18));
	});
});
