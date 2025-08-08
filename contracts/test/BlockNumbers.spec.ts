import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import type { BlockNumbers } from "../typechain-types/src/test/TestBlockNumbers";

describe("BlockNumbers", () => {
	async function deployFixture() {
		const testBlockNumbersFactory = await ethers.getContractFactory("TestBlockNumbers");
		const testBlockNumbers = await testBlockNumbersFactory.deploy();
		const appendN = async (n: number) => {
			for (let i = 1; i <= n; i++) {
				await testBlockNumbers.testAppend(i);
			}
		};
		return { testBlockNumbers, appendN };
	}

	// NOTE: Ethers.js edits struct arguments passed to functions in place, but returns them as
	// read-only. As a work-around, copy returned iterator structures so they can be used as
	// function parameters for other calls.
	function cp(it: BlockNumbers.IteratorStructOutput) {
		return [...it] as unknown as BlockNumbers.IteratorStruct;
	}

	it("should return the length of block numbers", async () => {
		const { testBlockNumbers, appendN } = await loadFixture(deployFixture);
		await appendN(13);
		expect(await testBlockNumbers.testLen()).to.equal(13);
	});

	it("should create an empty iterator for an empty list", async () => {
		const { testBlockNumbers } = await loadFixture(deployFixture);
		const it = await testBlockNumbers.testIter();
		expect(await testBlockNumbers.testCount(cp(it))).to.equal(0);
		const [, remaining] = await testBlockNumbers.testNext(cp(it));
		expect(remaining).to.be.false;
	});

	it("should iterate over lists", async () => {
		const { testBlockNumbers, appendN } = await loadFixture(deployFixture);
		await appendN(13);
		let it = await testBlockNumbers.testIter();
		let remaining: boolean;
		for (let i = 1; i <= 13; i++) {
			[it, remaining] = await testBlockNumbers.testNext(cp(it));
			expect(remaining).to.be.true;
			expect(await testBlockNumbers.testValue(cp(it))).to.equal(i);
		}
		[, remaining] = await testBlockNumbers.testNext(cp(it));
		expect(remaining).to.be.false;
	});

	it("should skip over items lists", async () => {
		const { testBlockNumbers, appendN } = await loadFixture(deployFixture);
		await appendN(13);
		const it = await testBlockNumbers.testIter();

		const it1 = await testBlockNumbers.testSkip(cp(it), 2);
		const [it2, remaining2] = await testBlockNumbers.testNext(cp(it1));
		expect(remaining2).to.be.true;
		expect(await testBlockNumbers.testValue(cp(it2))).to.equal(3);

		const it8 = await testBlockNumbers.testSkip(cp(it), 9);
		const [it9, remaining9] = await testBlockNumbers.testNext(cp(it8));
		expect(remaining9).to.be.true;
		expect(await testBlockNumbers.testValue(cp(it9))).to.equal(10);
	});

	it("should allow skipping no items", async () => {
		const { testBlockNumbers, appendN } = await loadFixture(deployFixture);
		await appendN(1);
		const itA = await testBlockNumbers.testIter();
		const itB = await testBlockNumbers.testSkip(cp(itA), 0);
		expect(cp(itA)).to.deep.equal(cp(itB));
	});

	it("should allow skipping all items", async () => {
		const { testBlockNumbers, appendN } = await loadFixture(deployFixture);
		await appendN(1);
		const it = await testBlockNumbers.testIter();

		const it0 = await testBlockNumbers.testSkip(cp(it), 1);
		expect(await testBlockNumbers.testCount(cp(it0))).to.equal(0);
		const [, remaining1] = await testBlockNumbers.testNext(cp(it0));
		expect(remaining1).to.be.false;

		const it99 = await testBlockNumbers.testSkip(cp(it), 100);
		expect(await testBlockNumbers.testCount(cp(it99))).to.equal(0);
		const [, remaining99] = await testBlockNumbers.testNext(cp(it99));
		expect(remaining99).to.be.false;
	});

	it("should take some items", async () => {
		const { testBlockNumbers, appendN } = await loadFixture(deployFixture);
		await appendN(5);
		const it = await testBlockNumbers.testIter();

		const it2 = await testBlockNumbers.testTake(cp(it), 2);
		expect(await testBlockNumbers.testCount(cp(it2))).to.equal(2);
		const [it2_0, remaining2_0] = await testBlockNumbers.testNext(cp(it2));
		expect(remaining2_0).to.be.true;
		expect(await testBlockNumbers.testValue(cp(it2_0))).to.equal(1);

		const it99 = await testBlockNumbers.testTake(cp(it), 99);
		expect(await testBlockNumbers.testCount(cp(it99))).to.equal(5);
		const [it99_0, remaining99_0] = await testBlockNumbers.testNext(cp(it99));
		expect(remaining99_0).to.be.true;
		expect(await testBlockNumbers.testValue(cp(it99_0))).to.equal(1);
	});

	it("should collect items from a starting point and count", async () => {
		const { testBlockNumbers, appendN } = await loadFixture(deployFixture);
		await appendN(100);
		const blockNumbers = await testBlockNumbers.testSlice(17, 12);
		expect(blockNumbers).to.deep.equal([...Array(12)].map((_, i) => i + 18));
	});
});
