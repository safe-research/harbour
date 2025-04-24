import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import {
	type BaseContract,
	Signature,
	type TypedDataDomain,
	ZeroAddress,
} from "ethers";
// Import necessary libraries and types
import { ethers } from "hardhat";
import type { SafeModuleTransactionRegistry } from "../typechain-types/contracts/SafeModuleTransactionRegistry";
import { execTransaction } from "./utils/utils";

describe("SafeModuleTransactionRegistry", () => {
	let masterCopy: BaseContract;
	let safeAddress: string;
	let chainId: bigint;
	let domain: TypedDataDomain;
	const types = {
		SafeModuleTransactionRegistry: [
			{ name: "to", type: "address" },
			{ name: "value", type: "uint256" },
			{ name: "data", type: "bytes" },
			{ name: "operation", type: "uint8" },
			{ name: "nonce", type: "uint256" },
		],
	};

	async function deployFixture() {
		const [deployer, alice, bob] = await ethers.getSigners();

		chainId = (await ethers.provider.getNetwork()).chainId;
		const safeFactory = await ethers.getContractFactory("Safe", deployer);
		masterCopy = await safeFactory.deploy();

		// Deploy a new SafeProxyFactory contract
		const proxyFactory = await (
			await ethers.getContractFactory("SafeProxyFactory", deployer)
		).deploy();

		// Setup the Safe, Step 1, generate transaction data
		const safeData = masterCopy.interface.encodeFunctionData("setup", [
			[await alice.getAddress()],
			1,
			ZeroAddress,
			"0x",
			ZeroAddress,
			ZeroAddress,
			0,
			ZeroAddress,
		]);

		// Read the safe address by executing the static call to createProxyWithNonce function
		safeAddress = await proxyFactory.createProxyWithNonce.staticCall(
			await masterCopy.getAddress(),
			safeData,
			0n,
		);

		if (safeAddress === ZeroAddress) {
			throw new Error("Safe address not found");
		}

		// Setup the Safe, Step 2, execute the transaction
		await proxyFactory.createProxyWithNonce(
			await masterCopy.getAddress(),
			safeData,
			0n,
		);

		const safe = await ethers.getContractAt("Safe", safeAddress);

		const safeModuleTransactionRegistry = await (
			await ethers.getContractFactory("SafeModuleTransactionRegistry", deployer)
		).deploy();

		// Enable the module in the safe, Step 1, generate transaction data
		const enableModuleData = masterCopy.interface.encodeFunctionData(
			"enableModule",
			[safeModuleTransactionRegistry.target],
		);

		// Enable the module in the safe, Step 2, execute the transaction
		await execTransaction([alice], safe, safe.target, 0, enableModuleData, 0);

		// Verify that the module is enabled
		expect(
			await safe.isModuleEnabled.staticCall(
				safeModuleTransactionRegistry.target,
			),
		).to.be.true;

		await deployer.sendTransaction({
			to: safeAddress,
			value: ethers.parseEther("1"),
		});

		domain = {
			name: "SafeModuleTransactionRegistry",
			version: "1",
			chainId: chainId,
			verifyingContract: await safeModuleTransactionRegistry.getAddress(),
		};

		return { deployer, alice, bob, safe, safeModuleTransactionRegistry };
	}

	it("Should successfully transfer native token", async () => {
		const { deployer, alice, safe, safeModuleTransactionRegistry } =
			await loadFixture(deployFixture);

		const to = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

		const safeModuleTx = {
			to: to,
			value: 1n,
			data: "0x",
			nonce: 0n,
			operation: 0n,
		};

		const signature = Signature.from(
			await alice.signTypedData(domain, types, safeModuleTx),
		);

		const safeModuleTransaction: SafeModuleTransactionRegistry.SafeModuleTransactionWithSignaturesStruct =
			{
				transaction: safeModuleTx,
				signatures: [
					{ v: signature.v, r: signature.r, s: signature.s, dynamicPart: "0x" },
				],
			};

		await expect(
			await safeModuleTransactionRegistry.registerSafeModuleTransaction(
				safe.target,
				safeModuleTransaction,
			),
		)
			.to.emit(safeModuleTransactionRegistry, "TransactionRegistered")
			.withArgs(await deployer.getAddress(), safe.target, 0n, 0n);

		expect(await ethers.provider.getBalance(to)).to.be.equal(0n);

		await safeModuleTransactionRegistry.execTransactionFromModule(
			safe.target,
			0n,
			0n,
		);

		expect(await ethers.provider.getBalance(to)).to.be.equal(1n);
		expect(
			await safeModuleTransactionRegistry.moduleTxNonces.staticCall(
				safe.target,
			),
		).to.be.equal(1n);
	});

	it("[Add tx to queue] Should successfully transfer native token", async () => {
		const { deployer, alice, safe, safeModuleTransactionRegistry } =
			await loadFixture(deployFixture);

		const to = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

		const safeModuleTx = {
			to: to,
			value: 1n,
			data: "0x",
			nonce: 0n,
			operation: 0n,
		};

		const signature = Signature.from(
			await alice.signTypedData(domain, types, safeModuleTx),
		);

		const safeModuleTransaction: SafeModuleTransactionRegistry.SafeModuleTransactionWithSignaturesStruct =
			{
				transaction: safeModuleTx,
				signatures: [
					{ v: signature.v, r: signature.r, s: signature.s, dynamicPart: "0x" },
				],
			};

		await expect(
			await safeModuleTransactionRegistry.registerSafeModuleTransaction(
				safe.target,
				safeModuleTransaction,
			),
		);

		await expect(
			await safeModuleTransactionRegistry.registerSafeModuleTransactionSignature(
				safe.target,
				0n,
				0n,
				{ v: signature.v, r: signature.r, s: signature.s, dynamicPart: "0x" },
			),
		)
			.to.emit(safeModuleTransactionRegistry, "SignatureAdded")
			.withArgs(await deployer.getAddress(), safe.target, 0n, 0n);
		expect(await ethers.provider.getBalance(to)).to.be.equal(0n);

		// Now we use the signature to transfer via our module
		await safeModuleTransactionRegistry.execTransactionFromModule(
			safe.target,
			0n,
			0n,
		);

		expect(await ethers.provider.getBalance(to)).to.be.equal(1n);
	});

	it("Reverts when trying to execute same tx again", async () => {
		const { alice, safe, safeModuleTransactionRegistry } =
			await loadFixture(deployFixture);

		const to = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

		const safeModuleTx = {
			to: to,
			value: 1n,
			data: "0x",
			nonce: 0n,
			operation: 0n,
		};

		const signature = Signature.from(
			await alice.signTypedData(domain, types, safeModuleTx),
		);

		const safeModuleTransaction: SafeModuleTransactionRegistry.SafeModuleTransactionWithSignaturesStruct =
			{
				transaction: safeModuleTx,
				signatures: [
					{ v: signature.v, r: signature.r, s: signature.s, dynamicPart: "0x" },
				],
			};

		expect(
			await safeModuleTransactionRegistry.registerSafeModuleTransaction(
				safe.target,
				safeModuleTransaction,
			),
		);

		expect(
			await safeModuleTransactionRegistry.registerSafeModuleTransaction(
				safe.target,
				safeModuleTransaction,
			),
		);

		expect(await ethers.provider.getBalance(to)).to.be.equal(0n);

		await safeModuleTransactionRegistry.execTransactionFromModule(
			safe.target,
			0n,
			0n,
		);

		expect(await ethers.provider.getBalance(to)).to.be.equal(1n);

		await expect(
			safeModuleTransactionRegistry.execTransactionFromModule(
				safe.target,
				0n,
				0n,
			),
		)
			.to.be.revertedWithCustomError(
				safeModuleTransactionRegistry,
				"InvalidNonce",
			)
			.withArgs(safe.target, 1n, 0n);
	});

	it("Reverts when provided nonce is higher then expected", async () => {
		const { alice, safe, safeModuleTransactionRegistry } =
			await loadFixture(deployFixture);

		const to = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

		const safeModuleTx = {
			to: to,
			value: 1n,
			data: "0x",
			nonce: 0n,
			operation: 0n,
		};

		const signature = Signature.from(
			await alice.signTypedData(domain, types, safeModuleTx),
		);

		const safeModuleTransaction: SafeModuleTransactionRegistry.SafeModuleTransactionWithSignaturesStruct =
			{
				transaction: safeModuleTx,
				signatures: [
					{ v: signature.v, r: signature.r, s: signature.s, dynamicPart: "0x" },
				],
			};

		expect(
			await safeModuleTransactionRegistry.registerSafeModuleTransaction(
				safe.target,
				safeModuleTransaction,
			),
		);

		expect(
			await safeModuleTransactionRegistry.registerSafeModuleTransaction(
				safe.target,
				safeModuleTransaction,
			),
		);

		await expect(
			safeModuleTransactionRegistry.execTransactionFromModule(
				safe.target,
				1n,
				0n,
			),
		)
			.to.be.revertedWithCustomError(
				safeModuleTransactionRegistry,
				"InvalidNonce",
			)
			.withArgs(safe.target, 0n, 1n);
	});

	it("Reverts when signature is empty", async () => {
		const { alice, safe, safeModuleTransactionRegistry } =
			await loadFixture(deployFixture);

		const to = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

		const safeModuleTx = {
			to: to,
			value: 1n,
			data: "0x",
			nonce: 0n,
			operation: 0n,
		};

		const signature = Signature.from(
			await alice.signTypedData(domain, types, safeModuleTx),
		);

		const safeModuleTransaction: SafeModuleTransactionRegistry.SafeModuleTransactionWithSignaturesStruct =
			{
				transaction: safeModuleTx,
				signatures: [],
			};

		await expect(
			safeModuleTransactionRegistry.registerSafeModuleTransaction(
				safe.target,
				safeModuleTransaction,
			),
		).to.be.revertedWithCustomError(
			safeModuleTransactionRegistry,
			"EmptySignatures",
		);
	});

	it("Allow identical transaction registration for same nonce", async () => {
		const { alice, safe, safeModuleTransactionRegistry } =
			await loadFixture(deployFixture);

		const to = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

		const safeModuleTx = {
			to: to,
			value: 1n,
			data: "0x",
			nonce: 0n,
			operation: 0n,
		};

		const signature = Signature.from(
			await alice.signTypedData(domain, types, safeModuleTx),
		);

		const safeModuleTransaction: SafeModuleTransactionRegistry.SafeModuleTransactionWithSignaturesStruct =
			{
				transaction: safeModuleTx,
				signatures: [
					{ v: signature.v, r: signature.r, s: signature.s, dynamicPart: "0x" },
				],
			};

		const safeModuleTransaction2: SafeModuleTransactionRegistry.SafeModuleTransactionWithSignaturesStruct =
			{
				transaction: safeModuleTx,
				signatures: [
					{ v: signature.v, r: signature.r, s: signature.s, dynamicPart: "0x" },
				],
			};

		expect(
			await safeModuleTransactionRegistry.registerSafeModuleTransaction(
				safe.target,
				safeModuleTransaction,
			),
		);

		expect(
			await safeModuleTransactionRegistry.registerSafeModuleTransaction(
				safe.target,
				safeModuleTransaction,
			),
		);

		expect(
			await safeModuleTransactionRegistry.execTransactionFromModule(
				safe.target,
				0n,
				1n,
			),
		);
	});

	it("Reverts when trying to re-use signature for same nonce", async () => {
		const { alice, safe, safeModuleTransactionRegistry } =
			await loadFixture(deployFixture);

		const to = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

		const safeModuleTx1 = {
			to: to,
			value: 1n,
			data: "0x",
			nonce: 0n,
			operation: 0n,
		};

		const signature = Signature.from(
			await alice.signTypedData(domain, types, safeModuleTx1),
		);

		const safeModuleTransaction1: SafeModuleTransactionRegistry.SafeModuleTransactionWithSignaturesStruct =
			{
				transaction: safeModuleTx1,
				signatures: [
					{ v: signature.v, r: signature.r, s: signature.s, dynamicPart: "0x" },
				],
			};

		const safeModuleTx2 = {
			to: to,
			value: 2n,
			data: "0x",
			nonce: 0n,
			operation: 0n,
		};

		const safeModuleTransaction2: SafeModuleTransactionRegistry.SafeModuleTransactionWithSignaturesStruct =
			{
				transaction: safeModuleTx2,
				signatures: [
					{ v: signature.v, r: signature.r, s: signature.s, dynamicPart: "0x" },
				],
			};

		expect(
			await safeModuleTransactionRegistry.registerSafeModuleTransaction(
				safe.target,
				safeModuleTransaction1,
			),
		);

		await expect(
			safeModuleTransactionRegistry.registerSafeModuleTransaction(
				safe.target,
				safeModuleTransaction2,
			),
		).to.be.revertedWith("GS026");
	});

	it("No double execution", async () => {
		const { alice, safe, safeModuleTransactionRegistry } =
			await loadFixture(deployFixture);

		const to = safeModuleTransactionRegistry.target;

		const calldata = safeModuleTransactionRegistry.interface.encodeFunctionData(
			"execTransactionFromModule",
			[safe.target, 0n, 0n],
		);

		const safeModuleTx = {
			to: to,
			value: 0n,
			data: calldata,
			nonce: 0n,
			operation: 0n,
		};

		const signature = Signature.from(
			await alice.signTypedData(domain, types, safeModuleTx),
		);

		const safeModuleTransaction: SafeModuleTransactionRegistry.SafeModuleTransactionWithSignaturesStruct =
			{
				transaction: safeModuleTx,
				signatures: [
					{ v: signature.v, r: signature.r, s: signature.s, dynamicPart: "0x" },
				],
			};

		expect(
			await safeModuleTransactionRegistry.registerSafeModuleTransaction(
				safe.target,
				safeModuleTransaction,
			),
		);

		await expect(
			safeModuleTransactionRegistry.execTransactionFromModule(
				safe.target,
				0n,
				0n,
			),
		)
			.to.be.revertedWithCustomError(
				safeModuleTransactionRegistry,
				"ModuleTransactionFailed",
			)
			.withArgs(safe.target, 0, 0);
	});

	it("Nested safe transaction execution", async () => {
		const { alice, safe, safeModuleTransactionRegistry } =
			await loadFixture(deployFixture);

		const to = safeModuleTransactionRegistry.target;

		const calldata = safeModuleTransactionRegistry.interface.encodeFunctionData(
			"execTransactionFromModule",
			[safe.target, 1n, 0n],
		);

		const safeModuleTx = {
			to: to,
			value: 0n,
			data: calldata,
			nonce: 0n,
			operation: 0n,
		};

		const signature = Signature.from(
			await alice.signTypedData(domain, types, safeModuleTx),
		);

		const receiver = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";
		const safeModuleTx2 = {
			to: receiver,
			value: 1n,
			data: "0x",
			nonce: 1n,
			operation: 0n,
		};

		const signature2 = Signature.from(
			await alice.signTypedData(domain, types, safeModuleTx2),
		);

		const safeModuleTransaction: SafeModuleTransactionRegistry.SafeModuleTransactionWithSignaturesStruct =
			{
				transaction: safeModuleTx,
				signatures: [
					{ v: signature.v, r: signature.r, s: signature.s, dynamicPart: "0x" },
				],
			};

		expect(
			await safeModuleTransactionRegistry.registerSafeModuleTransaction(
				safe.target,
				safeModuleTransaction,
			),
		);

		const safeModuleTransaction2: SafeModuleTransactionRegistry.SafeModuleTransactionWithSignaturesStruct =
			{
				transaction: safeModuleTx2,
				signatures: [
					{
						v: signature2.v,
						r: signature2.r,
						s: signature2.s,
						dynamicPart: "0x",
					},
				],
			};

		expect(
			await safeModuleTransactionRegistry.registerSafeModuleTransaction(
				safe.target,
				safeModuleTransaction2,
			),
		);

		expect(
			await safeModuleTransactionRegistry.execTransactionFromModule(
				safe.target,
				0n,
				0n,
			),
		);

		expect(await ethers.provider.getBalance(receiver)).to.be.equal(1n);
	});

	it("Execute transaction with 2:2 Safe", async () => {
		const { alice, bob, safe, safeModuleTransactionRegistry } =
			await loadFixture(deployFixture);

		// Update threshold to 2
		const calldata = safe.interface.encodeFunctionData(
			"addOwnerWithThreshold",
			[await bob.getAddress(), 2n],
		);

		await execTransaction([alice], safe, safe.target, 0n, calldata, 0);

		const to = "0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE";

		const safeModuleTx = {
			to: to,
			value: 1n,
			data: "0x",
			nonce: 0n,
			operation: 0n,
		};

		const addresses = await Promise.all(
			[alice, bob].map((wallet) => wallet.getAddress()),
		);

		const wallets = [alice, bob];
		// Sort the signers by their addresses
		const sorted = wallets.sort((a, b) => {
			const addressA = addresses[wallets.indexOf(a)];
			const addressB = addresses[wallets.indexOf(b)];
			return addressA.localeCompare(addressB, "en", { sensitivity: "base" });
		});

		const signatures = [];
		// Sign the transaction hash with each signer
		for (let i = 0; i < sorted.length; i++) {
			signatures.push(
				Signature.from(
					await sorted[i].signTypedData(domain, types, safeModuleTx),
				),
			);
		}

		const safeModuleTransaction: SafeModuleTransactionRegistry.SafeModuleTransactionWithSignaturesStruct =
			{
				transaction: safeModuleTx,
				signatures: [
					{
						v: signatures[0].v,
						r: signatures[0].r,
						s: signatures[0].s,
						dynamicPart: "0x",
					},
				],
			};

		expect(
			await safeModuleTransactionRegistry.registerSafeModuleTransaction(
				safe.target,
				safeModuleTransaction,
			),
		);

		expect(
			await safeModuleTransactionRegistry.registerSafeModuleTransactionSignature(
				safe.target,
				0n,
				0n,
				{
					v: signatures[1].v,
					r: signatures[1].r,
					s: signatures[1].s,
					dynamicPart: "0x",
				},
			),
		);

		expect(await ethers.provider.getBalance(to)).to.be.equal(0n);

		expect(
			await safeModuleTransactionRegistry.execTransactionFromModule(
				safe.target,
				0n,
				0n,
			),
		);

		expect(await ethers.provider.getBalance(to)).to.be.equal(1n);
	});
});
