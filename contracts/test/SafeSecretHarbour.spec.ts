import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";
import { decryptSafeTransaction, encryptSafeTransaction, randomX25519KeyPair } from "./utils/encryption";
import { computeInterfaceId } from "./utils/erc165";
import {
	getSafeTransactionHash,
	getSafeTransactionStructHash,
	Operation,
	populateSafeTransaction,
	signSafeTransaction,
} from "./utils/safeTx";

describe("SafeInternationalHarbour", () => {
	async function deployFixture() {
		const [deployer, signer, notary, alice] = await ethers.getSigners();
		const Factory = await ethers.getContractFactory("SafeSecretHarbour");
		const harbour = await Factory.deploy();

		const chainId = 0x5afen;
		const safe = ethers.getAddress(`0x${"5afe".repeat(10)}`);

		const { decryptionKey, encryptionKey } = await randomX25519KeyPair();

		return { deployer, signer, notary, alice, harbour, chainId, safe, decryptionKey, encryptionKey };
	}

	it("should report support for the secret harbour interface", async () => {
		const { harbour } = await loadFixture(deployFixture);

		expect(await computeInterfaceId("ISafeSecretHarbour")).to.equal("0x99cc1206");
		for (const interfaceId of ["0x01ffc9a7", "0x99cc1206"]) {
			expect(await harbour.supportsInterface(interfaceId)).to.be.true;
		}
	});

	it("should register a public encryption key", async () => {
		const { signer, harbour, encryptionKey } = await loadFixture(deployFixture);

		await harbour.connect(signer).registerEncryptionKey(ethers.ZeroHash, encryptionKey);
		const [storedEncryptionKey] = await harbour.retrieveEncryptionPublicKeys([signer]);
		expect(storedEncryptionKey).to.equal(encryptionKey);
	});

	it("should emit a key registration event", async () => {
		const { signer, harbour, encryptionKey } = await loadFixture(deployFixture);

		const context = ethers.id("context");
		await expect(harbour.connect(signer).registerEncryptionKey(context, encryptionKey))
			.to.emit(harbour, "EncryptionKeyRegistered")
			.withArgs(signer.address, context, encryptionKey);
	});

	it("should be able to retrieve a public encryption keys for multiple signers at a time", async () => {
		const { signer, alice, harbour, encryptionKey } = await loadFixture(deployFixture);

		const signers = [];
		const keys = [];
		for (const { account, key } of [
			{ account: signer, key: encryptionKey },
			{ account: alice, key: ethers.id("alice") },
		]) {
			await harbour.connect(account).registerEncryptionKey(ethers.ZeroHash, key);

			signers.push(account.address);
			keys.push(key);
		}

		expect(await harbour.retrieveEncryptionPublicKeys(signers)).to.deep.equal(keys);
	});

	it("should revert if signature length is not 65 bytes", async () => {
		const { harbour, chainId, safe } = await loadFixture(deployFixture);

		await expect(
			harbour.enqueueTransaction(
				chainId,
				safe,
				0, // nonce
				ethers.ZeroHash, // safeTxStructHash
				"0x1234", // invalid signature
				"0x", // encryptionBlob
			),
		).to.be.revertedWithCustomError(harbour, "InvalidECDSASignatureLength");
	});

	it("should revert if provided signature is invalid (ecrecover yields zero address)", async () => {
		const { harbour, chainId, safe } = await loadFixture(deployFixture);

		const invalidSignature = `0x${"00".repeat(65)}`;
		await expect(
			harbour.enqueueTransaction(
				chainId,
				safe,
				0, // nonce
				ethers.ZeroHash, // safeTxStructHash
				invalidSignature, // invalid signature but correct length
				"0x", // encryptionBlob
			),
		).to.be.revertedWithCustomError(harbour, "InvalidSignature");
	});

	it("should emit SafeTransactionSigned event with correct parameters", async () => {
		const { deployer, signer, harbour, chainId, safe, encryptionKey } = await loadFixture(deployFixture);

		const safeTx = populateSafeTransaction({
			to: deployer.address,
		});
		const safeTxStructHash = getSafeTransactionStructHash(safeTx);
		const signature = await signSafeTransaction(signer, safe, chainId, safeTx);
		const encryptionBlob = await encryptSafeTransaction(safeTx, [encryptionKey]);
		const params = [chainId, safe, safeTx.nonce, safeTxStructHash, signature, encryptionBlob] as const;
		const safeTxHash = getSafeTransactionHash(safe, chainId, safeTx);

		await expect(harbour.enqueueTransaction(...params))
			.to.emit(harbour, "SafeTransactionSigned")
			.withArgs(signer.address, safeTxHash, signature);
	});

	it("should emit SafeTransactionRegistered event with correct parameters", async () => {
		const { deployer, signer, harbour, chainId, safe, encryptionKey } = await loadFixture(deployFixture);

		const safeTx = populateSafeTransaction({
			to: deployer.address,
		});
		const safeTxStructHash = getSafeTransactionStructHash(safeTx);
		const signature = await signSafeTransaction(signer, safe, chainId, safeTx);
		const encryptionBlob = await encryptSafeTransaction(safeTx, [encryptionKey]);
		const params = [chainId, safe, safeTx.nonce, safeTxStructHash, signature, encryptionBlob] as const;
		const uid = await harbour.enqueueTransaction.staticCall(...params);
		const safeTxHash = getSafeTransactionHash(safe, chainId, safeTx);

		await expect(harbour.enqueueTransaction(...params))
			.to.emit(harbour, "SafeTransactionRegistered")
			.withArgs(uid, safeTxHash, encryptionBlob);
	});

	it("should register transaction and signature only when specified", async () => {
		const { deployer, signer, harbour, chainId, safe, encryptionKey } = await loadFixture(deployFixture);

		const safeTx = populateSafeTransaction({
			to: deployer.address,
		});
		const safeTxStructHash = getSafeTransactionStructHash(safeTx);
		const signature = await signSafeTransaction(signer, safe, chainId, safeTx);
		const encryptionBlob = await encryptSafeTransaction(safeTx, [encryptionKey]);

		await expect(harbour.enqueueTransaction(chainId, safe, safeTx.nonce, safeTxStructHash, signature, "0x"))
			.to.emit(harbour, "SafeTransactionSigned")
			.to.not.emit(harbour, "SafeTransactionRegistered");

		await expect(harbour.enqueueTransaction(chainId, safe, safeTx.nonce, safeTxStructHash, "0x", encryptionBlob))
			.to.emit(harbour, "SafeTransactionRegistered")
			.to.not.emit(harbour, "SafeTransactionSigned");
	});

	it("should revert when there is nothing to enqueue", async () => {
		const { harbour, chainId, safe } = await loadFixture(deployFixture);

		await expect(
			harbour.enqueueTransaction(chainId, safe, 0n, ethers.ZeroHash, "0x", "0x"),
		).to.be.revertedWithCustomError(harbour, "NothingToEnqueue");
	});

	it("should store the block number on transaction registration", async () => {
		const { harbour, chainId, safe, signer, notary, encryptionKey } = await loadFixture(deployFixture);

		const safeTx = populateSafeTransaction({
			to: ethers.Wallet.createRandom().address,
			value: 1n,
			data: "0x1234",
			operation: Operation.DELEGATECALL,
			safeTxGas: 100000n,
			baseGas: 21000n,
			gasPrice: 2n * 10n ** 9n, // 2 gwei
			gasToken: ethers.Wallet.createRandom().address,
			refundReceiver: ethers.Wallet.createRandom().address,
			nonce: 123n,
		});
		const safeTxStructHash = getSafeTransactionStructHash(safeTx);
		const signature = await signSafeTransaction(signer, safe, chainId, safeTx);
		const encryptionBlob = await encryptSafeTransaction(safeTx, [encryptionKey]);

		const params = [chainId, safe, safeTx.nonce, safeTxStructHash, signature, encryptionBlob] as const;
		const uid = await harbour.connect(notary).enqueueTransaction.staticCall(...params);
		const register = await harbour.connect(notary).enqueueTransaction(...params);
		const receipt = await register.wait();

		const registrationCount = await harbour.retrieveRegistrationCount(chainId, safe, safeTx.nonce, notary);
		const [registrations] = await harbour.retrieveRegistrations(
			chainId,
			safe,
			safeTx.nonce,
			notary,
			0,
			registrationCount,
		);
		expect(registrations).to.deep.equal([[receipt?.blockNumber, uid]]);
	});

	it("should not support malleable signatures", async () => {
		const { signer, harbour, chainId, safe } = await loadFixture(deployFixture);

		const safeTx = populateSafeTransaction({});
		const safeTxStructHash = getSafeTransactionStructHash(safeTx);
		const signature = await signSafeTransaction(signer, safe, chainId, safeTx);

		// Create malleable signature (r, n-s, v^1)
		const { r, s, v } = ethers.Signature.from(signature);

		const sBad = ethers.toBeHex(ethers.N - BigInt(s), 32);
		const vBad = ethers.toBeHex(v ^ 1, 1);
		const invalidSignature = ethers.concat([r, sBad, vBad]);

		// Try to enqueue malleable signature
		await expect(
			harbour.enqueueTransaction(chainId, safe, safeTx.nonce, safeTxStructHash, invalidSignature, "0x"),
		).to.be.revertedWithCustomError(harbour, "InvalidSignatureSValue");
	});

	it("should separate transaction registration by chain, safe, nonce and notary", async () => {
		const { notary, alice, harbour, chainId, safe, encryptionKey } = await loadFixture(deployFixture);

		const otherSafe = ethers.getAddress(`0x${"efa5".repeat(10)}`);
		const nonce = 0n;
		for (const permutation of [
			{ c: chainId, s: safe, n: nonce, w: notary },
			{ c: chainId + 1n, s: safe, n: nonce, w: notary },
			{ c: chainId, s: otherSafe, n: nonce, w: notary },
			{ c: chainId, s: safe, n: nonce + 1n, w: notary },
			{ c: chainId, s: safe, n: nonce, w: alice },
		]) {
			const { c: chainId, s: safe, n: nonce, w: notary } = permutation;
			const safeTx = populateSafeTransaction({ nonce });
			const safeTxStructHash = getSafeTransactionStructHash(safeTx);
			const signature = await signSafeTransaction(ethers.Wallet.createRandom(), safe, chainId, safeTx);
			const encryptionBlob = await encryptSafeTransaction(safeTx, [encryptionKey]);
			await harbour
				.connect(notary)
				.enqueueTransaction(chainId, safe, nonce, safeTxStructHash, signature, encryptionBlob);
		}

		expect(await harbour.retrieveRegistrationCount(chainId, safe, nonce, notary)).to.equal(1);
	});

	it("should allow registering the same transaction more than once", async () => {
		const { signer, notary, harbour, chainId, safe, encryptionKey } = await loadFixture(deployFixture);

		const safeTx = populateSafeTransaction({});
		const safeTxStructHash = getSafeTransactionStructHash(safeTx);
		const signature = await signSafeTransaction(signer, safe, chainId, safeTx);
		const encryptionBlob = await encryptSafeTransaction(safeTx, [encryptionKey]);

		await expect(
			harbour
				.connect(notary)
				.enqueueTransaction(chainId, safe, safeTx.nonce, safeTxStructHash, signature, encryptionBlob),
		).to.emit(harbour, "SafeTransactionRegistered");
		await expect(
			harbour.connect(notary).enqueueTransaction(chainId, safe, safeTx.nonce, safeTxStructHash, "0x", encryptionBlob),
		).to.emit(harbour, "SafeTransactionRegistered");

		expect(await harbour.retrieveRegistrationCount(chainId, safe, safeTx.nonce, notary)).to.equal(2);
	});

	it("should retrieve full E2EE transaction details via event", async () => {
		const { signer, notary, alice, harbour, chainId, safe, encryptionKey, decryptionKey } =
			await loadFixture(deployFixture);

		// Alice, another signer, registers her public encryption key on harbour.
		await harbour.connect(alice).registerEncryptionKey(ethers.ZeroHash, encryptionKey);

		// You query Alice's encryption key and use it for encrypting a transaction.
		const [alicesEncryptionKey] = await harbour.retrieveEncryptionPublicKeys([alice]);
		const safeTx = populateSafeTransaction({
			to: ethers.Wallet.createRandom().address,
			value: 1n,
			data: "0x1234",
			operation: Operation.DELEGATECALL,
			safeTxGas: 100000n,
			baseGas: 21000n,
			gasPrice: 2n * 10n ** 9n, // 2 gwei
			gasToken: ethers.Wallet.createRandom().address,
			refundReceiver: ethers.Wallet.createRandom().address,
			nonce: 123n,
		});
		const safeTxHash = getSafeTransactionHash(safe, chainId, safeTx);
		const safeTxStructHash = getSafeTransactionStructHash(safeTx);
		const signature = await signSafeTransaction(signer, safe, chainId, safeTx);
		const encryptionBlob = await encryptSafeTransaction(safeTx, [alicesEncryptionKey]);

		await harbour
			.connect(notary)
			.enqueueTransaction(chainId, safe, safeTx.nonce, safeTxStructHash, signature, encryptionBlob);

		// Alice can retrieve registrations for a specific Safe, nonce and signers (you). The
		// registration handle is enough to make a log query that **only** returns the data for the
		// transaction you registered, on a range including only a single block.
		const [[[blockNumber, uid]]] = await harbour.retrieveRegistrations(chainId, safe, safeTx.nonce, notary, 0, 1);

		const [{ args }] = await harbour.queryFilter(
			harbour.filters.SafeTransactionRegistered(uid),
			Number(blockNumber),
			Number(blockNumber),
		);
		expect(args).to.deep.equal([uid, safeTxHash, encryptionBlob]);

		// Since the transaction hash is not verified onchain, Alice MUST verify the correctness of
		// the Safe transaction hash from the encrypted Safe transaction data.
		const decryptedSafeTx = await decryptSafeTransaction(args.encryptionBlob, decryptionKey);
		expect(getSafeTransactionHash(safe, chainId, decryptedSafeTx)).to.equal(args.safeTxHash);
	});

	it("should retrieve paginated registration entries correctly", async () => {
		const { signer, notary, harbour, chainId, safe, encryptionKey } = await loadFixture(deployFixture);

		const nonce = 7n;
		const registrations = [];
		for (let i = 0; i < 5; i++) {
			const safeTx = populateSafeTransaction({
				to: ethers.Wallet.createRandom().address,
				value: BigInt(i),
				data: `0x${(i + 1).toString(16).padStart(2, "0")}`,
				nonce,
			});
			const safeTxStructHash = getSafeTransactionStructHash(safeTx);
			const signature = await signSafeTransaction(signer, safe, chainId, safeTx);
			const encryptionBlob = await encryptSafeTransaction(safeTx, [encryptionKey]);

			const params = [chainId, safe, nonce, safeTxStructHash, signature, encryptionBlob] as const;
			const uid = await harbour.connect(notary).enqueueTransaction.staticCall(...params);
			const register = await harbour.connect(notary).enqueueTransaction(...params);
			const receipt = await register.wait();

			registrations.push([receipt?.blockNumber, uid]);
		}

		// Retrieve total count
		const registrationCount = await harbour.retrieveRegistrationCount(chainId, safe, nonce, notary);
		expect(registrationCount).to.equal(5);

		// Page 1: start=0, count=2
		let [page, count] = await harbour.retrieveRegistrations(chainId, safe, nonce, notary, 0, 2);
		expect(page).to.deep.equal(registrations.slice(0, 2));
		expect(count).to.equal(5);

		// Page 2: start=2, count=2
		[page, count] = await harbour.retrieveRegistrations(chainId, safe, nonce, notary, 2, 2);
		expect(page).to.deep.equal(registrations.slice(2, 4));
		expect(count).to.equal(5);

		// Page 3: start=4, count=2 (only 1 element left)
		[page, count] = await harbour.retrieveRegistrations(chainId, safe, nonce, notary, 4, 2);
		expect(page).to.deep.equal(registrations.slice(4, 5));
		expect(count).to.equal(5);
	});

	it("should return empty array for retrieveRegistrations when start index >= totalCount", async () => {
		const { signer, notary, harbour, chainId, safe, encryptionKey } = await loadFixture(deployFixture);

		const nonce = 8n;
		const safeTx = populateSafeTransaction({
			to: ethers.Wallet.createRandom().address,
		});
		const safeTxStructHash = getSafeTransactionStructHash(safeTx);
		const signature = await signSafeTransaction(signer, safe, chainId, safeTx);
		const encryptionBlob = await encryptSafeTransaction(safeTx, [encryptionKey]);

		await harbour.connect(notary).enqueueTransaction(chainId, safe, nonce, safeTxStructHash, signature, encryptionBlob);

		const registrationCount = await harbour.retrieveRegistrationCount(chainId, safe, nonce, notary);
		expect(registrationCount).to.equal(1);

		// Start index == totalCount
		let [page, count] = await harbour.retrieveRegistrations(chainId, safe, nonce, notary, 1, 10);
		expect(page).to.deep.equal([]);
		expect(count).to.equal(1);

		// Start index > totalCount
		[page, count] = await harbour.retrieveRegistrations(chainId, safe, nonce, notary, 2, 10);
		expect(page).to.deep.equal([]);
		expect(count).to.equal(1);
	});

	it("should return correct total count via retrieveRegistrationCount", async () => {
		const { signer, notary, harbour, chainId, safe, encryptionKey } = await loadFixture(deployFixture);

		const nonce = 9n;

		// Check count when empty
		let registrationCount = await harbour.retrieveRegistrationCount(chainId, safe, nonce, notary);
		expect(registrationCount).to.equal(0);

		for (let i = 0; i < 3; i++) {
			const safeTx = populateSafeTransaction({
				to: ethers.Wallet.createRandom().address,
				value: BigInt(i),
				data: `0x${(i + 1).toString(16).padStart(2, "0")}`,
				nonce,
			});
			const safeTxStructHash = getSafeTransactionStructHash(safeTx);
			const signature = await signSafeTransaction(signer, safe, chainId, safeTx);
			const encryptionBlob = await encryptSafeTransaction(safeTx, [encryptionKey]);
			await harbour
				.connect(notary)
				.enqueueTransaction(chainId, safe, nonce, safeTxStructHash, signature, encryptionBlob);
		}

		// Check count after adding
		registrationCount = await harbour.retrieveRegistrationCount(chainId, safe, nonce, notary);
		expect(registrationCount).to.equal(3);
	});

	it("should handle pagination with start > 0, count = 0, and count > totalCount", async () => {
		const { signer, notary, harbour, chainId, safe, encryptionKey } = await loadFixture(deployFixture);

		const nonce = 10n;
		for (let i = 0; i < 2; i++) {
			const safeTx = populateSafeTransaction({
				to: ethers.Wallet.createRandom().address,
				value: BigInt(i),
				data: `0x${(i + 1).toString(16).padStart(2, "0")}`,
				nonce,
			});
			const safeTxStructHash = getSafeTransactionStructHash(safeTx);
			const signature = await signSafeTransaction(signer, safe, chainId, safeTx);
			const encryptionBlob = await encryptSafeTransaction(safeTx, [encryptionKey]);
			await harbour
				.connect(notary)
				.enqueueTransaction(chainId, safe, nonce, safeTxStructHash, signature, encryptionBlob);
		}

		// Case 1: count = 0
		let [page, count] = await harbour.retrieveRegistrations(chainId, safe, nonce, notary, 0, 0);
		expect(page.length).to.equal(0);
		expect(count).to.equal(2);

		// Case 2: start > 0, count = 0
		[page, count] = await harbour.retrieveRegistrations(chainId, safe, nonce, notary, 1, 0);
		expect(page.length).to.equal(0);
		expect(count).to.equal(2);

		// Case 3: count > totalCount
		[page, count] = await harbour.retrieveRegistrations(chainId, safe, nonce, notary, 0, 10); // Ask for 10, only 2 exist
		expect(page.length).to.equal(2);
		expect(count).to.equal(2);

		// Case 4: start > 0, count > remaining
		[page, count] = await harbour.retrieveRegistrations(chainId, safe, nonce, notary, 1, 10); // Ask for 10 starting at 1, only 1 left
		expect(page.length).to.equal(1);
		expect(count).to.equal(2);
	});

	it("should return zero via retrieveRegistrationCount for unknown chainId/safe/nonce/signer", async () => {
		const { signer, notary, alice, harbour, chainId, safe, encryptionKey } = await loadFixture(deployFixture);

		const nonce = 11n;
		const otherSafe = ethers.getAddress(`0x${"efa5".repeat(10)}`);

		const safeTx = populateSafeTransaction({ nonce });
		const safeTxStructHash = getSafeTransactionStructHash(safeTx);
		const signature = await signSafeTransaction(signer, safe, chainId, safeTx);
		const encryptionBlob = await encryptSafeTransaction(safeTx, [encryptionKey]);
		await harbour.connect(notary).enqueueTransaction(chainId, safe, nonce, safeTxStructHash, signature, encryptionBlob);

		expect(await harbour.retrieveRegistrationCount(chainId, safe, nonce, notary)).to.equal(1);

		expect(await harbour.retrieveRegistrationCount(chainId + 1n, safe, nonce, notary)).to.equal(0);
		expect(await harbour.retrieveRegistrationCount(chainId, otherSafe, nonce, notary)).to.equal(0);
		expect(await harbour.retrieveRegistrationCount(chainId, safe, nonce + 1n, notary)).to.equal(0);
		expect(await harbour.retrieveRegistrationCount(chainId, safe, nonce, alice)).to.equal(0);
	});

	it("should compute a unique registration identifier for event filtering", async () => {
		const { signer, notary, harbour, chainId, safe, encryptionKey } = await loadFixture(deployFixture);

		const nonce = 12n;
		for (let i = 0; i < 5; i++) {
			const safeTx = populateSafeTransaction({ nonce });
			const safeTxHash = getSafeTransactionHash(safe, chainId, safeTx);
			const safeTxStructHash = getSafeTransactionStructHash(safeTx);
			const [signature, encryptionBlob] =
				i === 0
					? [
							await signSafeTransaction(signer, safe, chainId, safeTx),
							await encryptSafeTransaction(safeTx, [encryptionKey]),
						]
					: ["0x", await encryptSafeTransaction(safeTx, [encryptionKey])];

			// NOTE: Registraion UIDs are **OPAQUE**, you should not rely on a specific behaviour in
			// your application. In practice, we currently hash the (chain, safe, nonce, notary)
			// tuple hash with the block number array index.
			const uid = ethers.solidityPackedKeccak256(
				["bytes32", "uint256"],
				[
					ethers.keccak256(
						ethers.AbiCoder.defaultAbiCoder().encode(
							["uint256", "address", "uint256", "address"],
							[chainId, safe, nonce, notary.address],
						),
					),
					i,
				],
			);

			await expect(
				harbour.connect(notary).enqueueTransaction(chainId, safe, nonce, safeTxStructHash, signature, encryptionBlob),
			)
				.to.emit(harbour, "SafeTransactionRegistered")
				.withArgs(uid, safeTxHash, encryptionBlob);
		}

		const registrationCount = await harbour.retrieveRegistrationCount(chainId, safe, nonce, notary);
		expect(registrationCount).to.equal(5);
	});
});
