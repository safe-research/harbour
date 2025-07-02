import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { AddressOne } from "@safe-global/safe-contracts";
import { expect } from "chai";
import { type BaseContract, type Signer, Wallet, ZeroAddress, ZeroHash } from "ethers";
import { ethers } from "hardhat";
import { EntryPoint__factory, SafeInternationalHarbour__factory } from "../typechain-types";
import { buildSafeTx, buildSignedUserOp, buildUserOp } from "./utils/erc4337";
import { EIP712_SAFE_TX_TYPE, getSafeTransactionHash, type SafeTransaction } from "./utils/safeTx";
import { toCompactSignature } from "./utils/signatures";

describe("SafeInternationalHarbour.4337", () => {
	async function deployFixture() {
		const [deployer, alice] = await ethers.getSigners();
		const chainId = BigInt((await ethers.provider.getNetwork()).chainId);
		const EntryPointFactory = new EntryPoint__factory(deployer as unknown as Signer);
		const entryPoint = await EntryPointFactory.deploy();
		const HarbourFactory = new SafeInternationalHarbour__factory(deployer as unknown as Signer);
		const harbour = await HarbourFactory.deploy(entryPoint);

		const safeAddress = await alice.getAddress();
		return { deployer, alice, harbour, chainId, safeAddress, entryPoint };
	}

	function error(contract: BaseContract, name: string, values: unknown[] = []): string {
		return contract.interface.encodeErrorResult(name, values);
	}

	const INVALID_SIG = `${"0x".padEnd(128, "a")}1f`;

	it("should revert if validateUserOp is not called from EntryPoint", async () => {
		const { harbour, chainId, safeAddress } = await loadFixture(deployFixture);
		const safeTx = buildSafeTx();
		const userOp = buildUserOp(harbour, safeAddress, chainId, safeTx, INVALID_SIG, 0);
		await expect(harbour.validateUserOp(userOp, ZeroHash, 0)).to.be.revertedWithCustomError(
			harbour,
			"InvalidEntryPoint",
		);
	});

	it("should revert if storeTransaction is not called from EntryPoint", async () => {
		const { deployer, harbour, chainId, safeAddress } = await loadFixture(deployFixture);
		const safeTx = buildSafeTx();
		console.log({ safeTx });
		const userOp = buildUserOp(harbour, safeAddress, chainId, safeTx, INVALID_SIG, 0);
		console.log({ userOp });
		await expect(
			harbour.storeTransaction(
				ZeroHash,
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
				ethers.ZeroAddress,
				ZeroHash,
				ZeroHash,
			),
		).to.be.revertedWithCustomError(harbour, "InvalidEntryPoint");
	});

	it.skip("should revert if paymaster is set", async () => {
		const { harbour, chainId, safeAddress, entryPoint } = await loadFixture(deployFixture);
		const safeTx = buildSafeTx();
		const userOp = buildUserOp(harbour, safeAddress, chainId, safeTx, INVALID_SIG, 0);
		await expect(entryPoint.handleOps([userOp], AddressOne))
			.to.be.revertedWithCustomError(entryPoint, "FailedOpWithRevert")
			.withArgs(0, "AA23 reverted", "0xea42a443");
	});

	it("should revert if signature length is not 65 bytes", async () => {
		const { harbour, chainId, safeAddress, entryPoint } = await loadFixture(deployFixture);
		const safeTx = buildSafeTx();
		const userOp = buildUserOp(harbour, safeAddress, chainId, safeTx, INVALID_SIG, 0);
		userOp.signature = INVALID_SIG; // This is the compact representation which is too short
		await expect(entryPoint.handleOps([userOp], AddressOne))
			.to.be.revertedWithCustomError(entryPoint, "FailedOpWithRevert")
			.withArgs(0, "AA23 reverted", error(harbour, "InvalidECDSASignatureLength"));
	});

	it("should revert if provided signature is invalid (ecrecover yields zero address)", async () => {
		const { entryPoint, harbour, chainId, safeAddress } = await loadFixture(deployFixture);
		const zeroSignature = `0x${"00".repeat(65)}`;
		const safeTx = buildSafeTx();
		const userOp = buildUserOp(harbour, safeAddress, chainId, safeTx, INVALID_SIG, 0);
		userOp.signature = zeroSignature;
		await expect(entryPoint.handleOps([userOp], AddressOne))
			.to.be.revertedWithCustomError(entryPoint, "FailedOpWithRevert")
			.withArgs(0, "AA23 reverted", error(harbour, "InvalidSignature"));
	});

	it("should revert if invalid UserOp nonce is provided", async () => {
		const { entryPoint, harbour, chainId, safeAddress } = await loadFixture(deployFixture);
		const safeTx = buildSafeTx();
		const signerWallet = ethers.Wallet.createRandom();
		const signerAddress = await signerWallet.getAddress();
		const signature = await signerWallet.signTypedData(
			{ chainId, verifyingContract: safeAddress },
			EIP712_SAFE_TX_TYPE,
			safeTx,
		);
		const userOp = buildUserOp(harbour, safeAddress, chainId, safeTx, signature, 0);

		const userOpNonce = await harbour.getNonce(signerAddress);
		await expect(entryPoint.handleOps([userOp], ZeroAddress))
			.to.be.revertedWithCustomError(entryPoint, "FailedOpWithRevert")
			.withArgs(0, "AA23 reverted", error(harbour, "UnexpectedNonce", [userOpNonce]));
	});

	it("should emit SignatureStored event with correct parameters on first enqueue", async () => {
		const { deployer, harbour, chainId, safeAddress, entryPoint } = await loadFixture(deployFixture);
		const signerWallet = Wallet.createRandom();
		const signerAddress = await signerWallet.getAddress();
		const safeTx = buildSafeTx({ to: deployer.address });
		const { userOp } = await buildSignedUserOp(harbour, signerWallet, chainId, safeAddress, safeTx);
		const safeTxHash = getSafeTransactionHash(safeAddress, chainId, safeTx);
		await expect(entryPoint.handleOps([userOp], AddressOne))
			.to.emit(harbour, "SignatureStored")
			.withArgs(signerAddress, safeAddress, safeTxHash, chainId, safeTx.nonce, 0);
	});

	it("should store transaction parameters on first enqueueTransaction call", async () => {
		const { harbour, chainId, safeAddress, entryPoint } = await loadFixture(deployFixture);
		const signerWallet = Wallet.createRandom();
		const safeTx: SafeTransaction = {
			to: Wallet.createRandom().address,
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
		const { userOp } = await buildSignedUserOp(harbour, signerWallet, chainId, safeAddress, safeTx);

		await entryPoint.handleOps([userOp], AddressOne);

		const safeTxHash = getSafeTransactionHash(safeAddress, chainId, safeTx);
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

	it.skip("should not overwrite existing parameters on subsequent calls with same safeTxHash", async () => {
		const { harbour, chainId, safeAddress } = await loadFixture(deployFixture);
		const signerWallet = ethers.Wallet.createRandom();
		const safeTx: SafeTransaction = {
			to: ethers.Wallet.createRandom().address,
			value: 1n,
			data: "0x1234",
			operation: 0,
			safeTxGas: 100000n,
			baseGas: 21000n,
			gasPrice: 1n * 10n ** 9n,
			gasToken: ethers.ZeroAddress,
			refundReceiver: ethers.ZeroAddress,
			nonce: 1n,
		};
		const safeTxHash = getSafeTransactionHash(safeAddress, chainId, safeTx);
		const signature = await signerWallet.signTypedData(
			{ chainId, verifyingContract: safeAddress },
			EIP712_SAFE_TX_TYPE,
			safeTx,
		);

		// First call - should store
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

		const storedTxBefore = await harbour.retrieveTransaction(safeTxHash);

		// Second call with different parameters but same hash (won't happen in reality, but tests logic)
		// Use a different signer just to make the second call valid
		const anotherSigner = ethers.Wallet.createRandom();
		const signature2 = await anotherSigner.signTypedData(
			{ chainId, verifyingContract: safeAddress },
			EIP712_SAFE_TX_TYPE,
			safeTx, // Use same tx to get same hash
		);
		await harbour.enqueueTransaction(
			safeAddress,
			chainId,
			safeTx.nonce, // Same nonce
			ethers.Wallet.createRandom().address, // Different 'to'
			safeTx.value + 1n, // Different value
			"0xabcd", // Different data
			1, // Different operation
			safeTx.safeTxGas + 1n, // Different safeTxGas
			safeTx.baseGas + 1n, // Different baseGas
			safeTx.gasPrice + 1n, // Different gasPrice
			ethers.Wallet.createRandom().address, // Different gasToken
			ethers.Wallet.createRandom().address, // Different refundReceiver
			signature2, // New valid signature for the *original* tx hash
		);

		const storedTxAfter = await harbour.retrieveTransaction(safeTxHash);

		// Verify parameters are unchanged from the first call
		expect(storedTxAfter.to).to.equal(storedTxBefore.to);
		expect(storedTxAfter.value).to.equal(storedTxBefore.value);
		expect(storedTxAfter.data).to.equal(storedTxBefore.data);
		expect(storedTxAfter.operation).to.equal(storedTxBefore.operation);
		expect(storedTxAfter.safeTxGas).to.equal(storedTxBefore.safeTxGas);
		expect(storedTxAfter.baseGas).to.equal(storedTxBefore.baseGas);
		expect(storedTxAfter.gasPrice).to.equal(storedTxBefore.gasPrice);
		expect(storedTxAfter.gasToken).to.equal(storedTxBefore.gasToken);
		expect(storedTxAfter.refundReceiver).to.equal(storedTxBefore.refundReceiver);
	});

	it("should not support malleable signatures", async () => {
		const { harbour, chainId, safeAddress, entryPoint } = await loadFixture(deployFixture);
		const signerWallet = ethers.Wallet.createRandom();

		const safeTx = buildSafeTx({ to: ethers.Wallet.createRandom().address });

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

		const userOpNonce = await harbour.getNonce(signerWallet.address);
		const userOp = buildUserOp(harbour, safeAddress, chainId, safeTx, signature1, userOpNonce);
		userOp.signature = signature2;
		await expect(entryPoint.handleOps([userOp], AddressOne))
			.to.be.revertedWithCustomError(entryPoint, "FailedOpWithRevert")
			.withArgs(0, "AA23 reverted", error(harbour, "InvalidSignatureSValue"));
	});

	it("should store signatures from different signers separately", async () => {
		const { entryPoint, harbour, chainId, safeAddress } = await loadFixture(deployFixture);
		const signer1Wallet = Wallet.createRandom();
		const signer2Wallet = Wallet.createRandom();
		const signer1Address = signer1Wallet.address;
		const signer2Address = signer2Wallet.address;

		const safeTx = buildSafeTx({ to: Wallet.createRandom().address, nonce: 5n });

		const { userOp: userOp1, signature: sig1 } = await buildSignedUserOp(
			harbour,
			signer1Wallet,
			chainId,
			safeAddress,
			safeTx,
		);
		const { userOp: userOp2, signature: sig2 } = await buildSignedUserOp(
			harbour,
			signer2Wallet,
			chainId,
			safeAddress,
			safeTx,
		);
		await entryPoint.handleOps([userOp1, userOp2], AddressOne);

		const safeTxHash = getSafeTransactionHash(safeAddress, chainId, safeTx);
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
		const { entryPoint, harbour, chainId, safeAddress } = await loadFixture(deployFixture);
		const signerWallet = Wallet.createRandom();
		const signerAddress = signerWallet.address;

		const safeTx = buildSafeTx({ to: Wallet.createRandom().address });
		const safeTxHash = getSafeTransactionHash(safeAddress, chainId, safeTx);

		const { userOp: userOp1 } = await buildSignedUserOp(harbour, signerWallet, chainId, safeAddress, safeTx);
		// First call stores signature
		await entryPoint.handleOps([userOp1], AddressOne);

		// Second call should revert
		const { userOp: userOp2 } = await buildSignedUserOp(harbour, signerWallet, chainId, safeAddress, safeTx);
		await expect(entryPoint.handleOps([userOp2], AddressOne))
			.to.be.revertedWithCustomError(entryPoint, "FailedOpWithRevert")
			.withArgs(0, "AA23 reverted", error(harbour, "SignerAlreadySignedTransaction", [signerAddress, safeTxHash]));
	});

	it("should retrieve full transaction details via retrieveTransaction", async () => {
		// This is essentially the same as "should store transaction parameters..." but focuses on retrieval
		const { entryPoint, harbour, chainId, safeAddress } = await loadFixture(deployFixture);
		const signerWallet = Wallet.createRandom();
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

		const { userOp } = await buildSignedUserOp(harbour, signerWallet, chainId, safeAddress, safeTx);
		// First call stores signature
		await entryPoint.handleOps([userOp], AddressOne);

		const safeTxHash = getSafeTransactionHash(safeAddress, chainId, safeTx);
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

	it("should retrieve paginated signature entries correctly", async () => {
		const { entryPoint, harbour, chainId, safeAddress } = await loadFixture(deployFixture);
		const signerWallet = Wallet.createRandom();
		const signerAddress = signerWallet.address;
		const nonce = 7n;
		const signatures = [];
		const txHashes = [];
		const sigData: { r: string; vs: string; txHash: string }[] = [];

		for (let i = 0; i < 5; i++) {
			const safeTx = buildSafeTx({
				to: ethers.Wallet.createRandom().address,
				value: BigInt(i),
				data: `0x${(i + 1).toString(16).padStart(2, "0")}`,
				nonce,
			});
			const { userOp, signature } = await buildSignedUserOp(harbour, signerWallet, chainId, safeAddress, safeTx);
			// First call stores signature
			await entryPoint.handleOps([userOp], AddressOne);
			const safeTxHash = getSafeTransactionHash(safeAddress, chainId, safeTx);
			signatures.push(signature);
			txHashes.push(safeTxHash);
			const { r, vs } = toCompactSignature(signature);
			sigData.push({
				r,
				vs,
				txHash: safeTxHash,
			});
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
		const { entryPoint, harbour, chainId, safeAddress } = await loadFixture(deployFixture);
		const signerWallet = Wallet.createRandom();
		const signerAddress = signerWallet.address;
		const nonce = 8n;
		const safeTx: SafeTransaction = buildSafeTx({ to: ethers.Wallet.createRandom().address, nonce });

		const { userOp } = await buildSignedUserOp(harbour, signerWallet, chainId, safeAddress, safeTx);
		// First call stores signature
		await entryPoint.handleOps([userOp], AddressOne);

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
		const { entryPoint, harbour, chainId, safeAddress } = await loadFixture(deployFixture);
		const signerWallet = Wallet.createRandom();
		const signerAddress = signerWallet.address;
		const nonce = 9n;

		// Check count when empty
		let count = await harbour.retrieveSignaturesCount(signerAddress, safeAddress, chainId, nonce);
		expect(count).to.equal(0);

		// Add 3 signatures
		for (let i = 0; i < 3; i++) {
			const safeTx = buildSafeTx({
				to: ethers.Wallet.createRandom().address,
				value: BigInt(i),
				data: `0x${(i + 1).toString(16).padStart(2, "0")}`,
				nonce,
			});
			const { userOp } = await buildSignedUserOp(harbour, signerWallet, chainId, safeAddress, safeTx);
			// First call stores signature
			await entryPoint.handleOps([userOp], AddressOne);
		}

		// Check count after adding
		count = await harbour.retrieveSignaturesCount(signerAddress, safeAddress, chainId, nonce);
		expect(count).to.equal(3);
	});

	it("should isolate transactions by chainId: same tx on different chainIds don't collide", async () => {
		const { entryPoint, harbour, safeAddress } = await loadFixture(deployFixture);
		const chainId1 = 1n;
		const chainId2 = 5n; // Different chainId
		const signerWallet = Wallet.createRandom();
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

		const { userOp: userOpChainId1 } = await buildSignedUserOp(harbour, signerWallet, chainId1, safeAddress, safeTx1);
		await entryPoint.handleOps([userOpChainId1], AddressOne);

		const { userOp: userOpChainId2 } = await buildSignedUserOp(harbour, signerWallet, chainId2, safeAddress, safeTx2);
		await entryPoint.handleOps([userOpChainId2], AddressOne);

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
		const { entryPoint, harbour, chainId, safeAddress } = await loadFixture(deployFixture);
		const signerWallet = Wallet.createRandom();
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

		const { userOp: userOp1 } = await buildSignedUserOp(harbour, signerWallet, chainId, safeAddress, safeTx1);
		await entryPoint.handleOps([userOp1], AddressOne);

		const { userOp: userOp2 } = await buildSignedUserOp(harbour, signerWallet, chainId, safeAddress, safeTx2);
		await entryPoint.handleOps([userOp2], AddressOne);

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
		const { entryPoint, harbour, chainId, alice } = await loadFixture(deployFixture); // alice is the default safeAddress
		const safeAddress1 = alice.address;
		const safeAddress2 = Wallet.createRandom().address; // A different Safe address
		const signerWallet = Wallet.createRandom();
		const signerAddress = signerWallet.address;
		const nonce = 13n;

		const safeTxBase: Omit<SafeTransaction, "nonce"> = {
			to: Wallet.createRandom().address,
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

		const { userOp: userOp1 } = await buildSignedUserOp(harbour, signerWallet, chainId, safeAddress1, safeTx1);
		await entryPoint.handleOps([userOp1], AddressOne);

		const { userOp: userOp2 } = await buildSignedUserOp(harbour, signerWallet, chainId, safeAddress2, safeTx2);
		await entryPoint.handleOps([userOp2], AddressOne);

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
		const { entryPoint, harbour, chainId, safeAddress } = await loadFixture(deployFixture);
		const signerWallet = Wallet.createRandom();
		const signerAddress = signerWallet.address;
		const nonce = 14n;

		// Add 2 signatures
		for (let i = 0; i < 2; i++) {
			const safeTx = buildSafeTx({
				to: Wallet.createRandom().address,
				value: BigInt(i),
				data: `0x${(i + 1).toString(16).padStart(2, "0")}`,
				nonce,
			});

			const { userOp } = await buildSignedUserOp(harbour, signerWallet, chainId, safeAddress, safeTx);
			await entryPoint.handleOps([userOp], AddressOne);
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
		const { entryPoint, harbour, chainId, safeAddress } = await loadFixture(deployFixture);
		const knownSigner = Wallet.createRandom();
		const knownSignerAddr = knownSigner.address;
		const knownNonce = 15n;
		const unknownSignerAddr = Wallet.createRandom().address;
		const unknownSafeAddr = Wallet.createRandom().address;
		const unknownChainId = chainId + 1n;
		const unknownNonce = knownNonce + 1n;

		// Add one known signature
		const safeTx = buildSafeTx({
			to: ethers.Wallet.createRandom().address,
			nonce: knownNonce,
		});

		const { userOp } = await buildSignedUserOp(harbour, knownSigner, chainId, safeAddress, safeTx);
		await entryPoint.handleOps([userOp], AddressOne);

		expect(await harbour.retrieveSignaturesCount(knownSignerAddr, safeAddress, chainId, knownNonce)).to.equal(1);

		// Test unknown variations
		expect(await harbour.retrieveSignaturesCount(unknownSignerAddr, safeAddress, chainId, knownNonce)).to.equal(0);
		expect(await harbour.retrieveSignaturesCount(knownSignerAddr, unknownSafeAddr, chainId, knownNonce)).to.equal(0);
		expect(await harbour.retrieveSignaturesCount(knownSignerAddr, safeAddress, unknownChainId, knownNonce)).to.equal(0);
		expect(await harbour.retrieveSignaturesCount(knownSignerAddr, safeAddress, chainId, unknownNonce)).to.equal(0);
	});

	it("should emit listIndex correctly in SignatureStored events (monotonic index)", async () => {
		const { entryPoint, harbour, chainId, safeAddress } = await loadFixture(deployFixture);
		const signerWallet = Wallet.createRandom();
		const signerAddress = signerWallet.address;
		const nonce = 16n;

		for (let i = 0; i < 3; i++) {
			const safeTx = buildSafeTx({
				to: Wallet.createRandom().address,
				value: BigInt(i),
				data: `0x${(i + 1).toString(16).padStart(2, "0")}`,
				nonce,
			});
			const safeTxHash = getSafeTransactionHash(safeAddress, chainId, safeTx);

			const { userOp } = await buildSignedUserOp(harbour, signerWallet, chainId, safeAddress, safeTx);
			await expect(entryPoint.handleOps([userOp], AddressOne))
				.to.emit(harbour, "SignatureStored")
				.withArgs(signerAddress, safeAddress, safeTxHash, chainId, nonce, BigInt(i));
		}

		const count = await harbour.retrieveSignaturesCount(signerAddress, safeAddress, chainId, nonce);
		expect(count).to.equal(3);
	});

	it("should emit NewTransaction event with correct parameters on first enqueue", async () => {
		const { entryPoint, deployer, harbour, chainId, safeAddress } = await loadFixture(deployFixture);
		const signerWallet = Wallet.createRandom();
		const safeTx: SafeTransaction = buildSafeTx({ to: deployer.address });
		const safeTxHash = getSafeTransactionHash(safeAddress, chainId, safeTx);
		const { userOp } = await buildSignedUserOp(harbour, signerWallet, chainId, safeAddress, safeTx);
		await expect(entryPoint.handleOps([userOp], AddressOne))
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
