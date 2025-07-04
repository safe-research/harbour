import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { type Signer, ZeroAddress } from "ethers";
import { ethers } from "hardhat";
import { SafeInternationalHarbour__factory } from "../typechain-types";
import { build4337Config, buildQuotaConfig } from "./utils/erc4337";
import { EIP712_SAFE_TX_TYPE, getSafeTransactionHash, type SafeTransaction } from "./utils/safeTx";
import { toCompactSignature } from "./utils/signatures";

describe("SafeInternationalHarbour", () => {
	async function deployFixture() {
		const [deployer, alice] = await ethers.getSigners();
		const chainId = BigInt((await ethers.provider.getNetwork()).chainId);
		const Factory = new SafeInternationalHarbour__factory(deployer as unknown as Signer);
		const harbour = await Factory.deploy(build4337Config(ZeroAddress), buildQuotaConfig());

		const safeAddress = await alice.getAddress();
		return { deployer, alice, harbour, chainId, safeAddress };
	}

	it("should revert if signature length is not 65 bytes", async () => {
		const { deployer, harbour, chainId, safeAddress } = await loadFixture(deployFixture);
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

	it("should revert if provided signature is invalid (ecrecover yields zero address)", async () => {
		const { deployer, harbour, chainId, safeAddress } = await loadFixture(deployFixture);
		const invalidSig = `0x${"00".repeat(65)}`;
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
				invalidSig, // invalid signature but correct length
			),
		).to.be.revertedWithCustomError(harbour, "InvalidSignature");
	});

	it("should emit SignatureStored event with correct parameters on first enqueue", async () => {
		const { deployer, harbour, chainId, safeAddress } = await loadFixture(deployFixture);
		const signerWallet = ethers.Wallet.createRandom();
		const signerAddress = await signerWallet.getAddress();
		const to = deployer.address;
		const value = 0n;
		const data = "0x";
		const operation = 0;
		const safeTxGas = 0n;
		const baseGas = 0n;
		const gasPrice = 0n;
		const nonce = 0n;
		const safeTx: SafeTransaction = {
			to,
			value,
			data,
			operation,
			safeTxGas,
			baseGas,
			gasPrice,
			gasToken: ethers.ZeroAddress,
			refundReceiver: ethers.ZeroAddress,
			nonce,
		};
		const safeTxHash = getSafeTransactionHash(safeAddress, chainId, safeTx);
		const signature = await signerWallet.signTypedData(
			{ chainId, verifyingContract: safeAddress },
			EIP712_SAFE_TX_TYPE,
			safeTx,
		);
		await expect(
			harbour.enqueueTransaction(
				safeAddress,
				chainId,
				safeTx.nonce,
				safeTx.to,
				safeTx.value,
				safeTx.data,
				safeTx.operation,
				safeTx.safeTxGas,
				safeTx.baseGas,
				safeTx.gasPrice,
				safeTx.gasToken,
				safeTx.refundReceiver,
				signature,
			),
		)
			.to.emit(harbour, "SignatureStored")
			.withArgs(signerAddress, safeAddress, safeTxHash, chainId, safeTx.nonce, 0);
	});

	it("should store transaction parameters on first enqueueTransaction call", async () => {
		const { harbour, chainId, safeAddress } = await loadFixture(deployFixture);
		const signerWallet = ethers.Wallet.createRandom();
		const safeTx: SafeTransaction = {
			to: ethers.Wallet.createRandom().address,
			value: 1n,
			data: "0x1234",
			operation: 1, // DELEGATECALL
			safeTxGas: 100000n,
			baseGas: 21000n,
			gasPrice: 2n * 10n ** 9n, // 2 gwei
			gasToken: ethers.Wallet.createRandom().address,
			refundReceiver: ethers.Wallet.createRandom().address,
			nonce: 123n,
		};
		const safeTxHash = getSafeTransactionHash(safeAddress, chainId, safeTx);
		const signature = await signerWallet.signTypedData(
			{ chainId, verifyingContract: safeAddress },
			EIP712_SAFE_TX_TYPE,
			safeTx,
		);

		await harbour.enqueueTransaction(
			safeAddress,
			chainId,
			safeTx.nonce,
			safeTx.to,
			safeTx.value,
			safeTx.data,
			safeTx.operation,
			safeTx.safeTxGas,
			safeTx.baseGas,
			safeTx.gasPrice,
			safeTx.gasToken,
			safeTx.refundReceiver,
			signature,
		);

		const storedTx = await harbour.retrieveTransaction(safeTxHash);
		expect(storedTx.to).to.equal(safeTx.to);
		expect(storedTx.value).to.equal(safeTx.value);
		expect(storedTx.data).to.equal(safeTx.data);
		expect(storedTx.operation).to.equal(safeTx.operation);
		expect(storedTx.safeTxGas).to.equal(safeTx.safeTxGas);
		expect(storedTx.baseGas).to.equal(safeTx.baseGas);
		expect(storedTx.gasPrice).to.equal(safeTx.gasPrice);
		expect(storedTx.gasToken).to.equal(safeTx.gasToken);
		expect(storedTx.refundReceiver).to.equal(safeTx.refundReceiver);
	});

	it("should not support malleable signatures", async () => {
		const { harbour, chainId, safeAddress } = await loadFixture(deployFixture);
		const signerWallet = ethers.Wallet.createRandom();

		const safeTx: SafeTransaction = {
			to: ethers.Wallet.createRandom().address,
			value: 0n,
			data: "0x",
			operation: 0,
			safeTxGas: 0n,
			baseGas: 0n,
			gasPrice: 0n,
			gasToken: ethers.ZeroAddress,
			refundReceiver: ethers.ZeroAddress,
			nonce: 0n,
		};

		const signature1 = await signerWallet.signTypedData(
			{ chainId, verifyingContract: safeAddress },
			EIP712_SAFE_TX_TYPE,
			safeTx,
		);

		// Create malleable signature (r, n-s, v')
		const sig1Bytes = ethers.getBytes(signature1);
		const r1 = ethers.dataSlice(sig1Bytes, 0, 32);
		const s1 = ethers.dataSlice(sig1Bytes, 32, 64);
		const v1 = Number.parseInt(ethers.dataSlice(sig1Bytes, 64, 65).substring(2), 16);

		const secp256k1N = BigInt("0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141");
		const s1BN = BigInt(s1);
		const s2BN = secp256k1N - s1BN;
		const s2 = ethers.toBeHex(s2BN, 32);
		const v2 = v1 === 27 ? 28 : 27; // Flip v
		const signature2 = ethers.concat([r1, s2, ethers.toBeHex(v2, 1)]);

		// Try to enqueue malleable signature
		await expect(
			harbour.enqueueTransaction(
				safeAddress,
				chainId,
				safeTx.nonce,
				safeTx.to,
				safeTx.value,
				safeTx.data,
				safeTx.operation,
				safeTx.safeTxGas,
				safeTx.baseGas,
				safeTx.gasPrice,
				safeTx.gasToken,
				safeTx.refundReceiver,
				signature2,
			),
		).to.be.revertedWithCustomError(harbour, "InvalidSignatureSValue");
	});

	it("should store signatures from different signers separately", async () => {
		const { harbour, chainId, safeAddress } = await loadFixture(deployFixture);
		const signer1Wallet = ethers.Wallet.createRandom();
		const signer2Wallet = ethers.Wallet.createRandom();
		const signer1Address = signer1Wallet.address;
		const signer2Address = signer2Wallet.address;

		const safeTx: SafeTransaction = {
			to: ethers.Wallet.createRandom().address,
			value: 0n,
			data: "0x",
			operation: 0,
			safeTxGas: 0n,
			baseGas: 0n,
			gasPrice: 0n,
			gasToken: ethers.ZeroAddress,
			refundReceiver: ethers.ZeroAddress,
			nonce: 5n,
		};
		const safeTxHash = getSafeTransactionHash(safeAddress, chainId, safeTx);

		const sig1 = await signer1Wallet.signTypedData(
			{ chainId, verifyingContract: safeAddress },
			EIP712_SAFE_TX_TYPE,
			safeTx,
		);
		const sig2 = await signer2Wallet.signTypedData(
			{ chainId, verifyingContract: safeAddress },
			EIP712_SAFE_TX_TYPE,
			safeTx,
		);

		await harbour.enqueueTransaction(
			safeAddress,
			chainId,
			safeTx.nonce,
			safeTx.to,
			safeTx.value,
			safeTx.data,
			safeTx.operation,
			safeTx.safeTxGas,
			safeTx.baseGas,
			safeTx.gasPrice,
			safeTx.gasToken,
			safeTx.refundReceiver,
			sig1,
		);
		await harbour.enqueueTransaction(
			safeAddress,
			chainId,
			safeTx.nonce,
			safeTx.to,
			safeTx.value,
			safeTx.data,
			safeTx.operation,
			safeTx.safeTxGas,
			safeTx.baseGas,
			safeTx.gasPrice,
			safeTx.gasToken,
			safeTx.refundReceiver,
			sig2,
		);

		const count1 = await harbour.retrieveSignaturesCount(signer1Address, safeAddress, chainId, safeTx.nonce);
		const [page1] = await harbour.retrieveSignatures(signer1Address, safeAddress, chainId, safeTx.nonce, 0, 1);
		const count2 = await harbour.retrieveSignaturesCount(signer2Address, safeAddress, chainId, safeTx.nonce);
		const [page2] = await harbour.retrieveSignatures(signer2Address, safeAddress, chainId, safeTx.nonce, 0, 1);

		expect(count1).to.equal(1);
		expect(page1.length).to.equal(1);
		expect(page1[0].txHash).to.equal(safeTxHash);
		const { r, vs } = toCompactSignature(sig1);
		expect(page1[0].r).to.equal(r);
		expect(page1[0].vs).to.equal(vs);

		expect(count2).to.equal(1);
		expect(page2.length).to.equal(1);
		expect(page2[0].txHash).to.equal(safeTxHash);
		const { r: r2, vs: vs2 } = toCompactSignature(sig2);
		expect(page2[0].r).to.equal(r2);
		expect(page2[0].vs).to.equal(vs2);
	});

	it("should revert when a signer tries to enqueue the same transaction signature twice", async () => {
		const { harbour, chainId, safeAddress } = await loadFixture(deployFixture);
		const signerWallet = ethers.Wallet.createRandom();
		const signerAddress = signerWallet.address;
		const safeTx: SafeTransaction = {
			to: ethers.Wallet.createRandom().address,
			value: 0n,
			data: "0x",
			operation: 0,
			safeTxGas: 0n,
			baseGas: 0n,
			gasPrice: 0n,
			gasToken: ethers.ZeroAddress,
			refundReceiver: ethers.ZeroAddress,
			nonce: 0n,
		};
		const safeTxHash = getSafeTransactionHash(safeAddress, chainId, safeTx);
		const signature = await signerWallet.signTypedData(
			{ chainId, verifyingContract: safeAddress },
			EIP712_SAFE_TX_TYPE,
			safeTx,
		);

		// First call stores signature
		await harbour.enqueueTransaction(
			safeAddress,
			chainId,
			safeTx.nonce,
			safeTx.to,
			safeTx.value,
			safeTx.data,
			safeTx.operation,
			safeTx.safeTxGas,
			safeTx.baseGas,
			safeTx.gasPrice,
			safeTx.gasToken,
			safeTx.refundReceiver,
			signature,
		);

		// Second call should revert
		await expect(
			harbour.enqueueTransaction(
				safeAddress,
				chainId,
				safeTx.nonce,
				safeTx.to,
				safeTx.value,
				safeTx.data,
				safeTx.operation,
				safeTx.safeTxGas,
				safeTx.baseGas,
				safeTx.gasPrice,
				safeTx.gasToken,
				safeTx.refundReceiver,
				signature,
			),
		)
			.to.be.revertedWithCustomError(harbour, "SignerAlreadySignedTransaction")
			.withArgs(signerAddress, safeTxHash);
	});

	it("should retrieve full transaction details via retrieveTransaction", async () => {
		// This is essentially the same as "should store transaction parameters..." but focuses on retrieval
		const { harbour, chainId, safeAddress } = await loadFixture(deployFixture);
		const signerWallet = ethers.Wallet.createRandom();
		const safeTx: SafeTransaction = {
			to: ethers.Wallet.createRandom().address,
			value: 12345n,
			data: "0xaabbccdd",
			operation: 0,
			safeTxGas: 54321n,
			baseGas: 12345n,
			gasPrice: 5n * 10n ** 9n,
			gasToken: ethers.Wallet.createRandom().address,
			refundReceiver: ethers.Wallet.createRandom().address,
			nonce: 99n,
		};
		const safeTxHash = getSafeTransactionHash(safeAddress, chainId, safeTx);
		const signature = await signerWallet.signTypedData(
			{ chainId, verifyingContract: safeAddress },
			EIP712_SAFE_TX_TYPE,
			safeTx,
		);

		await harbour.enqueueTransaction(
			safeAddress,
			chainId,
			safeTx.nonce,
			safeTx.to,
			safeTx.value,
			safeTx.data,
			safeTx.operation,
			safeTx.safeTxGas,
			safeTx.baseGas,
			safeTx.gasPrice,
			safeTx.gasToken,
			safeTx.refundReceiver,
			signature,
		);

		const storedTx = await harbour.retrieveTransaction(safeTxHash);
		expect(storedTx.to).to.equal(safeTx.to);
		expect(storedTx.value).to.equal(safeTx.value);
		expect(storedTx.data).to.equal(safeTx.data);
		expect(storedTx.operation).to.equal(safeTx.operation);
		expect(storedTx.safeTxGas).to.equal(safeTx.safeTxGas);
		expect(storedTx.baseGas).to.equal(safeTx.baseGas);
		expect(storedTx.gasPrice).to.equal(safeTx.gasPrice);
		expect(storedTx.gasToken).to.equal(safeTx.gasToken);
		expect(storedTx.refundReceiver).to.equal(safeTx.refundReceiver);
	});

	it("should return zero-initialized transaction for unknown safeTxHash", async () => {
		const { harbour } = await loadFixture(deployFixture);
		const unknownHash = ethers.keccak256("0xdeadbeef");
		const storedTx = await harbour.retrieveTransaction(unknownHash);

		expect(storedTx.to).to.equal(ethers.ZeroAddress);
		expect(storedTx.value).to.equal(0n);
		expect(storedTx.data).to.equal("0x");
		expect(storedTx.operation).to.equal(0);
		expect(storedTx.safeTxGas).to.equal(0n);
		expect(storedTx.baseGas).to.equal(0n);
		expect(storedTx.gasPrice).to.equal(0n);
		expect(storedTx.gasToken).to.equal(ethers.ZeroAddress);
		expect(storedTx.refundReceiver).to.equal(ethers.ZeroAddress);
	});

	it("should retrieve paginated signature entries correctly", async () => {
		const { harbour, chainId, safeAddress } = await loadFixture(deployFixture);
		const signerWallet = ethers.Wallet.createRandom();
		const signerAddress = signerWallet.address;
		const nonce = 7n;
		const signatures = [];
		const txHashes = [];
		const sigData: { r: string; vs: string; txHash: string }[] = [];

		for (let i = 0; i < 5; i++) {
			const safeTx: SafeTransaction = {
				to: ethers.Wallet.createRandom().address,
				value: BigInt(i),
				data: `0x${(i + 1).toString(16).padStart(2, "0")}`,
				operation: 0,
				safeTxGas: 0n,
				baseGas: 0n,
				gasPrice: 0n,
				gasToken: ethers.ZeroAddress,
				refundReceiver: ethers.ZeroAddress,
				nonce,
			};
			const safeTxHash = getSafeTransactionHash(safeAddress, chainId, safeTx);
			const signature = await signerWallet.signTypedData(
				{ chainId, verifyingContract: safeAddress },
				EIP712_SAFE_TX_TYPE,
				safeTx,
			);
			signatures.push(signature);
			txHashes.push(safeTxHash);
			const { r, vs } = toCompactSignature(signature);
			sigData.push({
				r,
				vs,
				txHash: safeTxHash,
			});

			await harbour.enqueueTransaction(
				safeAddress,
				chainId,
				safeTx.nonce,
				safeTx.to,
				safeTx.value,
				safeTx.data,
				safeTx.operation,
				safeTx.safeTxGas,
				safeTx.baseGas,
				safeTx.gasPrice,
				safeTx.gasToken,
				safeTx.refundReceiver,
				signature,
			);
		}

		// Retrieve total count
		const totalCount = await harbour.retrieveSignaturesCount(signerAddress, safeAddress, chainId, nonce);
		expect(totalCount).to.equal(5);

		// Page 1: start=0, count=2
		let [page, count] = await harbour.retrieveSignatures(signerAddress, safeAddress, chainId, nonce, 0, 2);
		expect(count).to.equal(5);
		expect(page.length).to.equal(2);
		expect(page[0].r).to.equal(sigData[0].r);
		expect(page[0].vs).to.equal(sigData[0].vs);
		expect(page[0].txHash).to.equal(sigData[0].txHash);
		expect(page[1].r).to.equal(sigData[1].r);
		expect(page[1].vs).to.equal(sigData[1].vs);
		expect(page[1].txHash).to.equal(sigData[1].txHash);

		// Page 2: start=2, count=2
		[page, count] = await harbour.retrieveSignatures(signerAddress, safeAddress, chainId, nonce, 2, 2);
		expect(count).to.equal(5);
		expect(page.length).to.equal(2);
		expect(page[0].r).to.equal(sigData[2].r);
		expect(page[0].vs).to.equal(sigData[2].vs);
		expect(page[0].txHash).to.equal(sigData[2].txHash);
		expect(page[1].r).to.equal(sigData[3].r);
		expect(page[1].vs).to.equal(sigData[3].vs);
		expect(page[1].txHash).to.equal(sigData[3].txHash);

		// Page 3: start=4, count=2 (only 1 element left)
		[page, count] = await harbour.retrieveSignatures(signerAddress, safeAddress, chainId, nonce, 4, 2);
		expect(count).to.equal(5);
		expect(page.length).to.equal(1);
		expect(page[0].r).to.equal(sigData[4].r);
		expect(page[0].vs).to.equal(sigData[4].vs);
		expect(page[0].txHash).to.equal(sigData[4].txHash);
	});

	it("should return empty array for retrieveSignatures when start index >= totalCount", async () => {
		const { harbour, chainId, safeAddress } = await loadFixture(deployFixture);
		const signerWallet = ethers.Wallet.createRandom();
		const signerAddress = signerWallet.address;
		const nonce = 8n;
		const safeTx: SafeTransaction = {
			to: ethers.Wallet.createRandom().address,
			value: 0n,
			data: "0x",
			operation: 0,
			safeTxGas: 0n,
			baseGas: 0n,
			gasPrice: 0n,
			gasToken: ethers.ZeroAddress,
			refundReceiver: ethers.ZeroAddress,
			nonce,
		};
		const signature = await signerWallet.signTypedData(
			{ chainId, verifyingContract: safeAddress },
			EIP712_SAFE_TX_TYPE,
			safeTx,
		);

		await harbour.enqueueTransaction(
			safeAddress,
			chainId,
			safeTx.nonce,
			safeTx.to,
			safeTx.value,
			safeTx.data,
			safeTx.operation,
			safeTx.safeTxGas,
			safeTx.baseGas,
			safeTx.gasPrice,
			safeTx.gasToken,
			safeTx.refundReceiver,
			signature,
		); // Only 1 signature stored

		const totalCount = await harbour.retrieveSignaturesCount(signerAddress, safeAddress, chainId, nonce);
		expect(totalCount).to.equal(1);

		// Start index == totalCount
		let [page, count] = await harbour.retrieveSignatures(signerAddress, safeAddress, chainId, nonce, 1, 10);
		expect(count).to.equal(1);
		expect(page.length).to.equal(0);

		// Start index > totalCount
		[page, count] = await harbour.retrieveSignatures(signerAddress, safeAddress, chainId, nonce, 2, 10);
		expect(count).to.equal(1);
		expect(page.length).to.equal(0);
	});

	it("should return correct total count via retrieveSignaturesCount", async () => {
		const { harbour, chainId, safeAddress } = await loadFixture(deployFixture);
		const signerWallet = ethers.Wallet.createRandom();
		const signerAddress = signerWallet.address;
		const nonce = 9n;

		// Check count when empty
		let count = await harbour.retrieveSignaturesCount(signerAddress, safeAddress, chainId, nonce);
		expect(count).to.equal(0);

		// Add 3 signatures
		for (let i = 0; i < 3; i++) {
			const safeTx: SafeTransaction = {
				to: ethers.Wallet.createRandom().address,
				value: BigInt(i),
				data: `0x${(i + 1).toString(16).padStart(2, "0")}`,
				operation: 0,
				safeTxGas: 0n,
				baseGas: 0n,
				gasPrice: 0n,
				gasToken: ethers.ZeroAddress,
				refundReceiver: ethers.ZeroAddress,
				nonce,
			};
			const signature = await signerWallet.signTypedData(
				{ chainId, verifyingContract: safeAddress },
				EIP712_SAFE_TX_TYPE,
				safeTx,
			);
			await harbour.enqueueTransaction(
				safeAddress,
				chainId,
				safeTx.nonce,
				safeTx.to,
				safeTx.value,
				safeTx.data,
				safeTx.operation,
				safeTx.safeTxGas,
				safeTx.baseGas,
				safeTx.gasPrice,
				safeTx.gasToken,
				safeTx.refundReceiver,
				signature,
			);
		}

		// Check count after adding
		count = await harbour.retrieveSignaturesCount(signerAddress, safeAddress, chainId, nonce);
		expect(count).to.equal(3);
	});

	it("should isolate transactions by chainId: same tx on different chainIds don't collide", async () => {
		const { harbour, safeAddress } = await loadFixture(deployFixture);
		const chainId1 = 1n;
		const chainId2 = 5n; // Different chainId
		const signerWallet = ethers.Wallet.createRandom();
		const signerAddress = signerWallet.address;
		const nonce = 10n;

		// Define a common transaction structure (except nonce which is part of key)
		const safeTxBase: Omit<SafeTransaction, "nonce"> = {
			to: ethers.Wallet.createRandom().address,
			value: 1n,
			data: "0xaa",
			operation: 0,
			safeTxGas: 1n,
			baseGas: 1n,
			gasPrice: 1n,
			gasToken: ethers.ZeroAddress,
			refundReceiver: ethers.ZeroAddress,
		};

		const safeTx1: SafeTransaction = { ...safeTxBase, nonce };
		const safeTx2: SafeTransaction = { ...safeTxBase, nonce }; // Same logical tx

		const safeTxHash1 = getSafeTransactionHash(safeAddress, chainId1, safeTx1);
		const safeTxHash2 = getSafeTransactionHash(safeAddress, chainId2, safeTx2);
		expect(safeTxHash1).to.not.equal(safeTxHash2); // Hashes must differ due to chainId in domain

		const sig1 = await signerWallet.signTypedData(
			{ chainId: chainId1, verifyingContract: safeAddress },
			EIP712_SAFE_TX_TYPE,
			safeTx1,
		);
		const sig2 = await signerWallet.signTypedData(
			{ chainId: chainId2, verifyingContract: safeAddress },
			EIP712_SAFE_TX_TYPE,
			safeTx2,
		);

		// Enqueue tx for chainId1
		await harbour.enqueueTransaction(
			safeAddress,
			chainId1,
			safeTx1.nonce,
			safeTx1.to,
			safeTx1.value,
			safeTx1.data,
			safeTx1.operation,
			safeTx1.safeTxGas,
			safeTx1.baseGas,
			safeTx1.gasPrice,
			safeTx1.gasToken,
			safeTx1.refundReceiver,
			sig1,
		);
		// Enqueue tx for chainId2
		await harbour.enqueueTransaction(
			safeAddress,
			chainId2,
			safeTx2.nonce,
			safeTx2.to,
			safeTx2.value,
			safeTx2.data,
			safeTx2.operation,
			safeTx2.safeTxGas,
			safeTx2.baseGas,
			safeTx2.gasPrice,
			safeTx2.gasToken,
			safeTx2.refundReceiver,
			sig2,
		);

		// Retrieve and verify counts and data for chainId1
		const count1 = await harbour.retrieveSignaturesCount(signerAddress, safeAddress, chainId1, nonce);
		const [page1] = await harbour.retrieveSignatures(signerAddress, safeAddress, chainId1, nonce, 0, 1);
		const txDetails1 = await harbour.retrieveTransaction(safeTxHash1);
		expect(count1).to.equal(1);
		expect(page1.length).to.equal(1);
		expect(page1[0].txHash).to.equal(safeTxHash1);
		expect(txDetails1.to).to.equal(safeTx1.to); // Ensure tx details stored correctly

		// Retrieve and verify counts and data for chainId2
		const count2 = await harbour.retrieveSignaturesCount(signerAddress, safeAddress, chainId2, nonce);
		const [page2] = await harbour.retrieveSignatures(signerAddress, safeAddress, chainId2, nonce, 0, 1);
		const txDetails2 = await harbour.retrieveTransaction(safeTxHash2);
		expect(count2).to.equal(1);
		expect(page2.length).to.equal(1);
		expect(page2[0].txHash).to.equal(safeTxHash2);
		expect(txDetails2.to).to.equal(safeTx2.to); // Ensure tx details stored correctly

		// Verify no signatures exist for the wrong chainId
		const count1_wrongChain = await harbour.retrieveSignaturesCount(signerAddress, safeAddress, chainId2, nonce);
		const count2_wrongChain = await harbour.retrieveSignaturesCount(signerAddress, safeAddress, chainId1, nonce);
		expect(count1_wrongChain).to.equal(1); // Already checked above
		expect(count2_wrongChain).to.equal(1); // Already checked above
		const [page1_wrongChain] = await harbour.retrieveSignatures(signerAddress, safeAddress, chainId2, nonce, 0, 1);
		const [page2_wrongChain] = await harbour.retrieveSignatures(signerAddress, safeAddress, chainId1, nonce, 0, 1);
		expect(page1_wrongChain[0].txHash).to.equal(safeTxHash2);
		expect(page2_wrongChain[0].txHash).to.equal(safeTxHash1);
	});

	it("should separate signature lists by nonce: same signer and chainId, different nonces", async () => {
		const { harbour, chainId, safeAddress } = await loadFixture(deployFixture);
		const signerWallet = ethers.Wallet.createRandom();
		const signerAddress = signerWallet.address;
		const nonce1 = 11n;
		const nonce2 = 12n;

		const safeTxBase: Omit<SafeTransaction, "nonce"> = {
			to: ethers.Wallet.createRandom().address,
			value: 1n,
			data: "0xbb",
			operation: 0,
			safeTxGas: 1n,
			baseGas: 1n,
			gasPrice: 1n,
			gasToken: ethers.ZeroAddress,
			refundReceiver: ethers.ZeroAddress,
		};

		const safeTx1: SafeTransaction = { ...safeTxBase, nonce: nonce1 };
		const safeTx2: SafeTransaction = { ...safeTxBase, nonce: nonce2 }; // Same tx details, different nonce

		const safeTxHash1 = getSafeTransactionHash(safeAddress, chainId, safeTx1);
		const safeTxHash2 = getSafeTransactionHash(safeAddress, chainId, safeTx2);
		expect(safeTxHash1).to.not.equal(safeTxHash2); // Hashes must differ due to nonce in struct

		const sig1 = await signerWallet.signTypedData(
			{ chainId, verifyingContract: safeAddress },
			EIP712_SAFE_TX_TYPE,
			safeTx1,
		);
		const sig2 = await signerWallet.signTypedData(
			{ chainId, verifyingContract: safeAddress },
			EIP712_SAFE_TX_TYPE,
			safeTx2,
		);

		await harbour.enqueueTransaction(
			safeAddress,
			chainId,
			safeTx1.nonce,
			safeTx1.to,
			safeTx1.value,
			safeTx1.data,
			safeTx1.operation,
			safeTx1.safeTxGas,
			safeTx1.baseGas,
			safeTx1.gasPrice,
			safeTx1.gasToken,
			safeTx1.refundReceiver,
			sig1,
		);
		await harbour.enqueueTransaction(
			safeAddress,
			chainId,
			safeTx2.nonce,
			safeTx2.to,
			safeTx2.value,
			safeTx2.data,
			safeTx2.operation,
			safeTx2.safeTxGas,
			safeTx2.baseGas,
			safeTx2.gasPrice,
			safeTx2.gasToken,
			safeTx2.refundReceiver,
			sig2,
		);

		// Verify counts and signatures for nonce1
		const count1 = await harbour.retrieveSignaturesCount(signerAddress, safeAddress, chainId, nonce1);
		const [page1] = await harbour.retrieveSignatures(signerAddress, safeAddress, chainId, nonce1, 0, 1);
		expect(count1).to.equal(1);
		expect(page1.length).to.equal(1);
		expect(page1[0].txHash).to.equal(safeTxHash1);

		// Verify counts and signatures for nonce2
		const count2 = await harbour.retrieveSignaturesCount(signerAddress, safeAddress, chainId, nonce2);
		const [page2] = await harbour.retrieveSignatures(signerAddress, safeAddress, chainId, nonce2, 0, 1);
		expect(count2).to.equal(1);
		expect(page2.length).to.equal(1);
		expect(page2[0].txHash).to.equal(safeTxHash2);

		// Verify no signatures for the wrong nonce
		const count1_wrongNonce = await harbour.retrieveSignaturesCount(signerAddress, safeAddress, chainId, nonce2);
		const count2_wrongNonce = await harbour.retrieveSignaturesCount(signerAddress, safeAddress, chainId, nonce1);
		expect(count1_wrongNonce).to.equal(1);
		expect(count2_wrongNonce).to.equal(1);
	});

	it("should isolate mappings between different Safe addresses", async () => {
		const { harbour, chainId, alice } = await loadFixture(deployFixture); // alice is the default safeAddress
		const safeAddress1 = alice.address;
		const safeAddress2 = ethers.Wallet.createRandom().address; // A different Safe address
		const signerWallet = ethers.Wallet.createRandom();
		const signerAddress = signerWallet.address;
		const nonce = 13n;

		const safeTxBase: Omit<SafeTransaction, "nonce"> = {
			to: ethers.Wallet.createRandom().address,
			value: 1n,
			data: "0xcc",
			operation: 0,
			safeTxGas: 1n,
			baseGas: 1n,
			gasPrice: 1n,
			gasToken: ethers.ZeroAddress,
			refundReceiver: ethers.ZeroAddress,
		};

		const safeTx1: SafeTransaction = { ...safeTxBase, nonce }; // For safeAddress1
		const safeTx2: SafeTransaction = { ...safeTxBase, nonce }; // Same logical tx, for safeAddress2

		const safeTxHash1 = getSafeTransactionHash(safeAddress1, chainId, safeTx1);
		const safeTxHash2 = getSafeTransactionHash(safeAddress2, chainId, safeTx2);
		expect(safeTxHash1).to.not.equal(safeTxHash2); // Hashes differ due to safeAddress in domain

		const sig1 = await signerWallet.signTypedData(
			{ chainId, verifyingContract: safeAddress1 },
			EIP712_SAFE_TX_TYPE,
			safeTx1,
		);
		const sig2 = await signerWallet.signTypedData(
			{ chainId, verifyingContract: safeAddress2 },
			EIP712_SAFE_TX_TYPE,
			safeTx2,
		);

		await harbour.enqueueTransaction(
			safeAddress1,
			chainId,
			safeTx1.nonce,
			safeTx1.to,
			safeTx1.value,
			safeTx1.data,
			safeTx1.operation,
			safeTx1.safeTxGas,
			safeTx1.baseGas,
			safeTx1.gasPrice,
			safeTx1.gasToken,
			safeTx1.refundReceiver,
			sig1,
		);
		await harbour.enqueueTransaction(
			safeAddress2,
			chainId,
			safeTx2.nonce,
			safeTx2.to,
			safeTx2.value,
			safeTx2.data,
			safeTx2.operation,
			safeTx2.safeTxGas,
			safeTx2.baseGas,
			safeTx2.gasPrice,
			safeTx2.gasToken,
			safeTx2.refundReceiver,
			sig2,
		);

		// Verify counts and signatures for safeAddress1
		const count1 = await harbour.retrieveSignaturesCount(signerAddress, safeAddress1, chainId, nonce);
		const [page1] = await harbour.retrieveSignatures(signerAddress, safeAddress1, chainId, nonce, 0, 1);
		expect(count1).to.equal(1);
		expect(page1.length).to.equal(1);
		expect(page1[0].txHash).to.equal(safeTxHash1);

		// Verify counts and signatures for safeAddress2
		const count2 = await harbour.retrieveSignaturesCount(signerAddress, safeAddress2, chainId, nonce);
		const [page2] = await harbour.retrieveSignatures(signerAddress, safeAddress2, chainId, nonce, 0, 1);
		expect(count2).to.equal(1);
		expect(page2.length).to.equal(1);
		expect(page2[0].txHash).to.equal(safeTxHash2);

		// Verify no signatures for the wrong safe address
		const count1_wrongSafe = await harbour.retrieveSignaturesCount(signerAddress, safeAddress2, chainId, nonce);
		const count2_wrongSafe = await harbour.retrieveSignaturesCount(signerAddress, safeAddress1, chainId, nonce);
		expect(count1_wrongSafe).to.equal(1);
		expect(count2_wrongSafe).to.equal(1);
	});

	it("should handle pagination with start > 0, count = 0, and count > totalCount", async () => {
		const { harbour, chainId, safeAddress } = await loadFixture(deployFixture);
		const signerWallet = ethers.Wallet.createRandom();
		const signerAddress = signerWallet.address;
		const nonce = 14n;

		// Add 2 signatures
		for (let i = 0; i < 2; i++) {
			const safeTx: SafeTransaction = {
				to: ethers.Wallet.createRandom().address,
				value: BigInt(i),
				data: `0x${(i + 1).toString(16).padStart(2, "0")}`,
				operation: 0,
				safeTxGas: 0n,
				baseGas: 0n,
				gasPrice: 0n,
				gasToken: ethers.ZeroAddress,
				refundReceiver: ethers.ZeroAddress,
				nonce,
			};
			const signature = await signerWallet.signTypedData(
				{ chainId, verifyingContract: safeAddress },
				EIP712_SAFE_TX_TYPE,
				safeTx,
			);
			await harbour.enqueueTransaction(
				safeAddress,
				chainId,
				safeTx.nonce,
				safeTx.to,
				safeTx.value,
				safeTx.data,
				safeTx.operation,
				safeTx.safeTxGas,
				safeTx.baseGas,
				safeTx.gasPrice,
				safeTx.gasToken,
				safeTx.refundReceiver,
				signature,
			);
		}
		const totalCount = await harbour.retrieveSignaturesCount(signerAddress, safeAddress, chainId, nonce);
		expect(totalCount).to.equal(2);

		// Case 1: count = 0
		let [page, count] = await harbour.retrieveSignatures(signerAddress, safeAddress, chainId, nonce, 0, 0);
		expect(count).to.equal(2);
		expect(page.length).to.equal(0);

		// Case 2: start > 0, count = 0
		[page, count] = await harbour.retrieveSignatures(signerAddress, safeAddress, chainId, nonce, 1, 0);
		expect(count).to.equal(2);
		expect(page.length).to.equal(0);

		// Case 3: count > totalCount
		[page, count] = await harbour.retrieveSignatures(signerAddress, safeAddress, chainId, nonce, 0, 10); // Ask for 10, only 2 exist
		expect(count).to.equal(2);
		expect(page.length).to.equal(2);

		// Case 4: start > 0, count > remaining
		[page, count] = await harbour.retrieveSignatures(signerAddress, safeAddress, chainId, nonce, 1, 10); // Ask for 10 starting at 1, only 1 left
		expect(count).to.equal(2);
		expect(page.length).to.equal(1);
	});

	it("should return zero via retrieveSignaturesCount for unknown signer/safe/chainId/nonce", async () => {
		const { harbour, chainId, safeAddress } = await loadFixture(deployFixture);
		const knownSigner = ethers.Wallet.createRandom();
		const knownSignerAddr = knownSigner.address;
		const knownNonce = 15n;
		const unknownSignerAddr = ethers.Wallet.createRandom().address;
		const unknownSafeAddr = ethers.Wallet.createRandom().address;
		const unknownChainId = chainId + 1n;
		const unknownNonce = knownNonce + 1n;

		// Add one known signature
		const safeTx: SafeTransaction = {
			to: ethers.Wallet.createRandom().address,
			value: 0n,
			data: "0x",
			operation: 0,
			safeTxGas: 0n,
			baseGas: 0n,
			gasPrice: 0n,
			gasToken: ethers.ZeroAddress,
			refundReceiver: ethers.ZeroAddress,
			nonce: knownNonce,
		};
		const signature = await knownSigner.signTypedData(
			{ chainId, verifyingContract: safeAddress },
			EIP712_SAFE_TX_TYPE,
			safeTx,
		);
		await harbour.enqueueTransaction(
			safeAddress,
			chainId,
			safeTx.nonce,
			safeTx.to,
			safeTx.value,
			safeTx.data,
			safeTx.operation,
			safeTx.safeTxGas,
			safeTx.baseGas,
			safeTx.gasPrice,
			safeTx.gasToken,
			safeTx.refundReceiver,
			signature,
		);

		expect(await harbour.retrieveSignaturesCount(knownSignerAddr, safeAddress, chainId, knownNonce)).to.equal(1);

		// Test unknown variations
		expect(await harbour.retrieveSignaturesCount(unknownSignerAddr, safeAddress, chainId, knownNonce)).to.equal(0);
		expect(await harbour.retrieveSignaturesCount(knownSignerAddr, unknownSafeAddr, chainId, knownNonce)).to.equal(0);
		expect(await harbour.retrieveSignaturesCount(knownSignerAddr, safeAddress, unknownChainId, knownNonce)).to.equal(0);
		expect(await harbour.retrieveSignaturesCount(knownSignerAddr, safeAddress, chainId, unknownNonce)).to.equal(0);
	});

	it("should emit listIndex correctly in SignatureStored events (monotonic index)", async () => {
		const { harbour, chainId, safeAddress } = await loadFixture(deployFixture);
		const signerWallet = ethers.Wallet.createRandom();
		const signerAddress = signerWallet.address;
		const nonce = 16n;

		for (let i = 0; i < 3; i++) {
			const safeTx: SafeTransaction = {
				to: ethers.Wallet.createRandom().address,
				value: BigInt(i),
				data: `0x${(i + 1).toString(16).padStart(2, "0")}`,
				operation: 0,
				safeTxGas: 0n,
				baseGas: 0n,
				gasPrice: 0n,
				gasToken: ethers.ZeroAddress,
				refundReceiver: ethers.ZeroAddress,
				nonce,
			};
			const safeTxHash = getSafeTransactionHash(safeAddress, chainId, safeTx);
			const signature = await signerWallet.signTypedData(
				{ chainId, verifyingContract: safeAddress },
				EIP712_SAFE_TX_TYPE,
				safeTx,
			);
			await expect(
				harbour.enqueueTransaction(
					safeAddress,
					chainId,
					safeTx.nonce,
					safeTx.to,
					safeTx.value,
					safeTx.data,
					safeTx.operation,
					safeTx.safeTxGas,
					safeTx.baseGas,
					safeTx.gasPrice,
					safeTx.gasToken,
					safeTx.refundReceiver,
					signature,
				),
			)
				.to.emit(harbour, "SignatureStored")
				.withArgs(signerAddress, safeAddress, safeTxHash, chainId, nonce, BigInt(i));
		}

		const count = await harbour.retrieveSignaturesCount(signerAddress, safeAddress, chainId, nonce);
		expect(count).to.equal(3);
	});

	it("should emit NewTransaction event with correct parameters on first enqueue", async () => {
		const { deployer, harbour, chainId, safeAddress } = await loadFixture(deployFixture);
		const signerWallet = ethers.Wallet.createRandom();
		const to = deployer.address;
		const value = 0n;
		const data = "0x";
		const operation = 0;
		const safeTxGas = 0n;
		const baseGas = 0n;
		const gasPrice = 0n;
		const nonce = 0n;
		const safeTx: SafeTransaction = {
			to,
			value,
			data,
			operation,
			safeTxGas,
			baseGas,
			gasPrice,
			gasToken: ethers.ZeroAddress,
			refundReceiver: ethers.ZeroAddress,
			nonce,
		};
		const safeTxHash = getSafeTransactionHash(safeAddress, chainId, safeTx);
		const signature = await signerWallet.signTypedData(
			{ chainId, verifyingContract: safeAddress },
			EIP712_SAFE_TX_TYPE,
			safeTx,
		);
		await expect(
			harbour.enqueueTransaction(
				safeAddress,
				chainId,
				safeTx.nonce,
				safeTx.to,
				safeTx.value,
				safeTx.data,
				safeTx.operation,
				safeTx.safeTxGas,
				safeTx.baseGas,
				safeTx.gasPrice,
				safeTx.gasToken,
				safeTx.refundReceiver,
				signature,
			),
		)
			.to.emit(harbour, "NewTransaction")
			.withArgs(
				safeTxHash,
				safeAddress,
				chainId,
				safeTx.nonce,
				safeTx.to,
				safeTx.value,
				safeTx.operation,
				safeTx.safeTxGas,
				safeTx.baseGas,
				safeTx.gasPrice,
				safeTx.gasToken,
				safeTx.refundReceiver,
				safeTx.data,
			);
	});
});
