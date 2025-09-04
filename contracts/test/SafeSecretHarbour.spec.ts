import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import type { Signer } from "ethers";
import { ethers } from "hardhat";
import {
	decryptSafeTransaction,
	deterministicX25519KeyPair,
	encryptSafeTransaction,
	randomX25519KeyPair,
	signEncryptionKeyRegistration,
} from "./utils/encryption";
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

	async function getBlockTimestamp() {
		const block = await ethers.provider.getBlock("latest");
		if (block === null) {
			throw new Error("no latest block");
		}
		return block.timestamp;
	}

	it("should act as an encrypted transaction queue", async () => {
		const { deployer, harbour, chainId, safe } = await loadFixture(deployFixture);

		// ------------------------------------------------------------------

		// Lets say we have a 3/5 Safe at some nonce and owners.
		const nonce = 1337n;
		const owners = [...Array(5)].map(() => ethers.Wallet.createRandom(ethers.provider));

		// We have a list of notaries that we want to listen for transaction registrations from.
		// They can either be the owners themselves, some shared proposal account, or the harbour
		// validator set.
		const notaries = [...Array(2)].map(() => ethers.Wallet.createRandom(ethers.provider));

		// ------------------------------------------------------------------

		// Lets give everyone some gas money...
		for (const to of [...owners, ...notaries]) {
			await deployer.sendTransaction({ to, value: ethers.parseEther("1.0") });
		}

		// Now lets imagine that some of the owners played around with Harbour, where they generated
		// and registered some encryption keys.
		for (const owner of owners.slice(0, 3)) {
			const context = ethers.randomBytes(32);
			const { encryptionKey } = await deterministicX25519KeyPair(owner, context);
			await harbour.connect(owner).registerEncryptionKey(context, encryptionKey);
		}

		// ------------------------------------------------------------------

		async function getPendingTransactionsGroupedByHash() {
			const registrations = await Promise.all(
				notaries.map((notary) => harbour.retrieveTransactions(chainId, safe, nonce, notary, 0, 10)),
			);
			const details = await Promise.all(
				registrations
					.flatMap(([page, _]) => page)
					.map(([blockNumber, uid]) =>
						harbour.queryFilter(
							harbour.filters.SafeTransactionRegistered(uid),
							Number(blockNumber),
							Number(blockNumber),
						),
					),
			);
			const groups = Object.groupBy(details.flat(), ({ args }) => args.safeTxHash);
			return Object.entries(groups).map(([safeTxHash, events]) => ({
				safeTxHash,
				// Get the latest blob per transaction hash.
				encryptionBlob: events?.pop()?.args?.encryptionBlob ?? "0x",
			}));
		}

		async function decryptFirstPendingTransaction(signer: Signer) {
			const [context] = await harbour.retrieveEncryptionKey(signer);
			const { decryptionKey } = await deterministicX25519KeyPair(signer, context);
			const [{ safeTxHash, encryptionBlob }] = await getPendingTransactionsGroupedByHash();
			const safeTx = await decryptSafeTransaction(encryptionBlob, decryptionKey);
			// Clients MUST verify Safe transaction integrity!
			expect(getSafeTransactionHash(safe, chainId, safeTx)).to.equal(safeTxHash);
			return safeTx;
		}

		async function enqueuePendingSafeTransactionSignature(signer: Signer) {
			const safeTx = await decryptFirstPendingTransaction(signer);
			const safeTxStructHash = getSafeTransactionStructHash(safeTx);
			const signature = await signSafeTransaction(signer, safe, chainId, safeTx);
			await harbour.enqueueTransaction(chainId, safe, nonce, safeTxStructHash, signature, "0x");
		}

		// ------------------------------------------------------------------

		// An owner will create a new transaction and sign it. A notary will encrypt and enqueue
		// it in harbour. In practice, the notary can either be an owner themselves, some shared
		// proposer account, or the harbour validator set.
		{
			const signer = owners[0];

			const safeTx = populateSafeTransaction({
				to: ethers.Wallet.createRandom().address,
				value: ethers.parseEther("1.0"),
				nonce,
			});
			const safeTxStructHash = getSafeTransactionStructHash(safeTx);
			const signature = await signSafeTransaction(signer, safe, chainId, safeTx);

			const notary = notaries[0];

			const publicKeys = await harbour
				.retrieveEncryptionPublicKeys(owners)
				.then((publicKeys) => publicKeys.filter((publicKey) => publicKey !== ethers.ZeroHash));
			const encryptionBlob = await encryptSafeTransaction(safeTx, publicKeys);
			await harbour
				.connect(notary)
				.enqueueTransaction(chainId, safe, nonce, safeTxStructHash, signature, encryptionBlob);
		}

		// ------------------------------------------------------------------

		// Another owner, monitoring harbour for specific notaries, will see the transaction,
		// decrypt it, and submit their signature onchain. Note that they do not re-broadcast the
		// transaction ecryption blob - just their signature. Also, since no new trasaction data
		// was included, it does not have to be notarized.
		await enqueuePendingSafeTransactionSignature(owners[2]);

		// ------------------------------------------------------------------

		// Other owners registered their keys so a new encryption blob must be registered onchain
		// so that owners can decrypt it with their new keys. Note that we need _someone_ to decrypt
		// the original transaction JWE in order to be re-encrypt the Safe transaction. For testing
		// puposes, we re-encrypt **everything**, however in the future we can be smarter about what
		// we upload with new transaction registrations. In particular, the `jose` library that we
		// use does not support adding new recipients to an already created JWE (although it is
		// technically possible).
		for (const owner of [owners[1], owners[3]]) {
			const context = ethers.randomBytes(32);
			const { encryptionKey } = await deterministicX25519KeyPair(owner, context);
			await harbour.connect(owner).registerEncryptionKey(context, encryptionKey);
		}
		{
			const signer = owners[0];
			const notary = notaries[1];

			const safeTx = await decryptFirstPendingTransaction(signer);
			const publicKeys = await harbour
				.retrieveEncryptionPublicKeys(owners)
				.then((publicKeys) => publicKeys.filter((publicKey) => publicKey !== ethers.ZeroHash));
			const newEncryptionBlob = await encryptSafeTransaction(safeTx, publicKeys);
			const safeTxStructHash = getSafeTransactionStructHash(safeTx);
			await harbour.connect(notary).enqueueTransaction(chainId, safe, nonce, safeTxStructHash, "0x", newEncryptionBlob);
		}

		// ------------------------------------------------------------------

		// Now, we can sign the transaction for the owner that just registered a new encryption key,
		// using the encrypted wrapped key that was just registered.
		await enqueuePendingSafeTransactionSignature(owners[3]);

		// ------------------------------------------------------------------

		// Finally, we can collect all the signatures for the Safe transaction in preparation to
		// execute it. Note that you don't need to actually decrypt the transaction to collect the
		// signatures (but you do need to in order to execute the transaction - in order to build
		// the `execTransaction` call).
		{
			const [{ safeTxHash }] = await getPendingTransactionsGroupedByHash();
			const registrations = await harbour.retrieveSignatures(owners, safeTxHash);
			const details = await Promise.all(
				registrations
					.map((blockNumber, i) => ({ blockNumber, signer: owners[i] }))
					.filter(({ blockNumber }) => blockNumber !== 0n)
					.map(({ blockNumber, signer }) =>
						harbour.queryFilter(
							harbour.filters.SafeTransactionSigned(signer),
							Number(blockNumber),
							Number(blockNumber),
						),
					),
			);
			const signatures = details.flat().map(({ args: { signer, signature } }) => ({ signer, signature }));

			expect(signatures.length).to.equal(3);
			expect(signatures.map(({ signer }) => signer)).to.deep.equal(
				[owners[0], owners[2], owners[3]].map((owner) => owner.address),
			);
			for (const { signer, signature } of signatures) {
				expect(ethers.recoverAddress(safeTxHash, signature)).to.equal(signer);
			}
		}
	});

	it("should report support for the secret harbour interface", async () => {
		const { harbour } = await loadFixture(deployFixture);

		expect(await computeInterfaceId("ISafeSecretHarbour")).to.equal("0xe030e473");
		for (const interfaceId of ["0x01ffc9a7", "0xe030e473"]) {
			expect(await harbour.supportsInterface(interfaceId)).to.be.true;
		}
	});

	it("should register a public encryption key", async () => {
		const { signer, harbour, encryptionKey } = await loadFixture(deployFixture);

		const context = ethers.id("context");
		await harbour.connect(signer).registerEncryptionKey(context, encryptionKey);
		const storedEncryptionKey = await harbour.retrieveEncryptionKey(signer);
		expect(storedEncryptionKey).to.deep.equal([context, encryptionKey]);
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

	it("should register a public encryption key on behalf of a signer", async () => {
		const { signer, harbour, encryptionKey } = await loadFixture(deployFixture);

		const context = ethers.id("context");
		const { chainId } = await ethers.provider.getNetwork();
		const nonce = await harbour.retrieveEncryptionKeyRegistrationNonce(signer);
		const deadline = (await getBlockTimestamp()) + 600; // 10 minutes.
		const signature = await signEncryptionKeyRegistration(signer, await harbour.getAddress(), {
			context,
			publicKey: encryptionKey,
			harbourChainId: chainId,
			nonce,
			deadline,
		});
		await harbour.registerEncryptionKeyFor(signer, context, encryptionKey, nonce, deadline, signature);
		const storedEncryptionKey = await harbour.retrieveEncryptionKey(signer);
		expect(storedEncryptionKey).to.deep.equal([context, encryptionKey]);
	});

	it("should increment the nonce when registering an encryption key on behalf of a signer", async () => {
		const { signer, harbour, encryptionKey } = await loadFixture(deployFixture);

		const context = ethers.id("context");
		const { chainId } = await ethers.provider.getNetwork();
		const startingNonce = await harbour.retrieveEncryptionKeyRegistrationNonce(signer);
		const deadline = ethers.MaxUint256;

		for (let i = 0; i < 5; i++) {
			const nonce = startingNonce + BigInt(i);
			const signature = await signEncryptionKeyRegistration(signer, await harbour.getAddress(), {
				context,
				publicKey: encryptionKey,
				harbourChainId: chainId,
				nonce,
				deadline,
			});
			await harbour.registerEncryptionKeyFor(signer, context, encryptionKey, nonce, deadline, signature);
			const storedNonce = await harbour.retrieveEncryptionKeyRegistrationNonce(signer);
			expect(storedNonce).to.equal(nonce + 1n);
		}
	});

	it("should emit a key registration event when registering on behalf of a signer", async () => {
		const { signer, harbour, encryptionKey } = await loadFixture(deployFixture);

		const context = ethers.id("context");
		const { chainId } = await ethers.provider.getNetwork();
		const nonce = await harbour.retrieveEncryptionKeyRegistrationNonce(signer);
		const deadline = ethers.MaxUint256;
		const signature = await signEncryptionKeyRegistration(signer, await harbour.getAddress(), {
			context,
			publicKey: encryptionKey,
			harbourChainId: chainId,
			nonce,
			deadline,
		});
		await expect(harbour.registerEncryptionKeyFor(signer, context, encryptionKey, nonce, deadline, signature))
			.to.emit(harbour, "EncryptionKeyRegistered")
			.withArgs(signer.address, context, encryptionKey);
	});

	it("should revert if the encryption key registration nonce is invalid", async () => {
		const { signer, harbour, encryptionKey } = await loadFixture(deployFixture);

		const context = ethers.id("context");
		const { chainId } = await ethers.provider.getNetwork();
		const currentNonce = await harbour.retrieveEncryptionKeyRegistrationNonce(signer);
		const nonce = 42n;
		const deadline = ethers.MaxUint256;
		const signature = await signEncryptionKeyRegistration(signer, await harbour.getAddress(), {
			context,
			publicKey: encryptionKey,
			harbourChainId: chainId,
			nonce,
			deadline,
		});
		await expect(harbour.registerEncryptionKeyFor(signer, context, encryptionKey, nonce, deadline, signature))
			.to.be.revertedWithCustomError(harbour, "InvalidEncryptionKeyRegistrationNonce")
			.withArgs(currentNonce);
	});

	it("should revert when replaying encryption key registrations", async () => {
		const { signer, harbour, encryptionKey } = await loadFixture(deployFixture);

		const context = ethers.id("context");
		const { chainId } = await ethers.provider.getNetwork();
		const nonce = await harbour.retrieveEncryptionKeyRegistrationNonce(signer);
		const deadline = ethers.MaxUint256;
		const signature = await signEncryptionKeyRegistration(signer, await harbour.getAddress(), {
			context,
			publicKey: encryptionKey,
			harbourChainId: chainId,
			nonce,
			deadline,
		});
		await expect(harbour.registerEncryptionKeyFor(signer, context, encryptionKey, nonce, deadline, signature)).to.not.be
			.reverted;
		await expect(harbour.registerEncryptionKeyFor(signer, context, encryptionKey, nonce, deadline, signature))
			.to.be.revertedWithCustomError(harbour, "InvalidEncryptionKeyRegistrationNonce")
			.withArgs(nonce + 1n);
	});

	it("should revert when encryption key deadline has expired", async () => {
		const { signer, harbour, encryptionKey } = await loadFixture(deployFixture);

		const context = ethers.id("context");
		const { chainId } = await ethers.provider.getNetwork();
		const nonce = await harbour.retrieveEncryptionKeyRegistrationNonce(signer);
		const timestamp = await getBlockTimestamp();

		for (const [deadline, ok] of [
			[0, false],
			[timestamp - 1, false],
			[timestamp, true],
			[timestamp + 1, true],
		] as const) {
			const signature = await signEncryptionKeyRegistration(signer, await harbour.getAddress(), {
				context,
				publicKey: encryptionKey,
				harbourChainId: chainId,
				nonce,
				deadline,
			});
			const call = harbour.registerEncryptionKeyFor.staticCall(
				signer,
				context,
				encryptionKey,
				nonce,
				deadline,
				signature,
			);
			if (ok) {
				await expect(call).to.not.be.reverted;
			} else {
				await expect(call).to.be.revertedWithCustomError(harbour, "EncryptionKeyRegistrationExpired");
			}
		}
	});

	it("should revert when encryption key authentication is invalid", async () => {
		const { signer, alice, harbour, encryptionKey } = await loadFixture(deployFixture);

		const context = ethers.id("context");
		const { chainId } = await ethers.provider.getNetwork();
		const nonce = await harbour.retrieveEncryptionKeyRegistrationNonce(signer);
		const deadline = ethers.MaxUint256;
		const aliceSignature = await signEncryptionKeyRegistration(alice, await harbour.getAddress(), {
			context,
			publicKey: encryptionKey,
			harbourChainId: chainId,
			nonce,
			deadline,
		});

		for (const [signature, error] of [
			["0x1234", "InvalidECDSASignatureLength"],
			[`0x${"00".repeat(65)}`, "InvalidSignature"],
			[aliceSignature, "UnexpectedSigner"],
		]) {
			await expect(
				harbour.registerEncryptionKeyFor(signer, context, encryptionKey, nonce, deadline, signature),
			).to.be.revertedWithCustomError(harbour, error);
		}
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
				"0xffff", // encryptionBlob
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
				"0xffff", // encryptionBlob
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

		const registrationCount = await harbour.retrieveTransactionCount(chainId, safe, safeTx.nonce, notary);
		const [registrations] = await harbour.retrieveTransactions(
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

		expect(await harbour.retrieveTransactionCount(chainId, safe, nonce, notary)).to.equal(1);
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

		expect(await harbour.retrieveTransactionCount(chainId, safe, safeTx.nonce, notary)).to.equal(2);
	});

	it("should revert when repeating a signature for the same transaction", async () => {
		const { signer, notary, alice, harbour, chainId, safe, encryptionKey } = await loadFixture(deployFixture);

		const safeTx = populateSafeTransaction({});
		const safeTxStructHash = getSafeTransactionStructHash(safeTx);
		const safeTxHash = getSafeTransactionHash(safe, chainId, safeTx);
		const signature = await signSafeTransaction(signer, safe, chainId, safeTx);
		const encryptionBlob = await encryptSafeTransaction(safeTx, [encryptionKey]);

		await harbour
			.connect(notary)
			.enqueueTransaction(chainId, safe, safeTx.nonce, safeTxStructHash, signature, encryptionBlob);

		await expect(
			harbour.connect(alice).enqueueTransaction(chainId, safe, safeTx.nonce, safeTxStructHash, signature, "0x"),
		)
			.to.be.revertedWithCustomError(harbour, "SignerAlreadySignedTransaction")
			.withArgs(signer.address, safeTxHash);
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
		const [[[blockNumber, uid]]] = await harbour.retrieveTransactions(chainId, safe, safeTx.nonce, notary, 0, 1);

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
		const registrationCount = await harbour.retrieveTransactionCount(chainId, safe, nonce, notary);
		expect(registrationCount).to.equal(5);

		// Page 1: start=0, count=2
		let [page, count] = await harbour.retrieveTransactions(chainId, safe, nonce, notary, 0, 2);
		expect(page).to.deep.equal(registrations.slice(0, 2));
		expect(count).to.equal(5);

		// Page 2: start=2, count=2
		[page, count] = await harbour.retrieveTransactions(chainId, safe, nonce, notary, 2, 2);
		expect(page).to.deep.equal(registrations.slice(2, 4));
		expect(count).to.equal(5);

		// Page 3: start=4, count=2 (only 1 element left)
		[page, count] = await harbour.retrieveTransactions(chainId, safe, nonce, notary, 4, 2);
		expect(page).to.deep.equal(registrations.slice(4, 5));
		expect(count).to.equal(5);
	});

	it("should return empty array for retrieveTransactions when start index >= totalCount", async () => {
		const { signer, notary, harbour, chainId, safe, encryptionKey } = await loadFixture(deployFixture);

		const nonce = 8n;
		const safeTx = populateSafeTransaction({
			to: ethers.Wallet.createRandom().address,
		});
		const safeTxStructHash = getSafeTransactionStructHash(safeTx);
		const signature = await signSafeTransaction(signer, safe, chainId, safeTx);
		const encryptionBlob = await encryptSafeTransaction(safeTx, [encryptionKey]);

		await harbour.connect(notary).enqueueTransaction(chainId, safe, nonce, safeTxStructHash, signature, encryptionBlob);

		const registrationCount = await harbour.retrieveTransactionCount(chainId, safe, nonce, notary);
		expect(registrationCount).to.equal(1);

		// Start index == totalCount
		let [page, count] = await harbour.retrieveTransactions(chainId, safe, nonce, notary, 1, 10);
		expect(page).to.deep.equal([]);
		expect(count).to.equal(1);

		// Start index > totalCount
		[page, count] = await harbour.retrieveTransactions(chainId, safe, nonce, notary, 2, 10);
		expect(page).to.deep.equal([]);
		expect(count).to.equal(1);
	});

	it("should return correct total count via retrieveTransactionCount", async () => {
		const { signer, notary, harbour, chainId, safe, encryptionKey } = await loadFixture(deployFixture);

		const nonce = 9n;

		// Check count when empty
		let registrationCount = await harbour.retrieveTransactionCount(chainId, safe, nonce, notary);
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
		registrationCount = await harbour.retrieveTransactionCount(chainId, safe, nonce, notary);
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
		let [page, count] = await harbour.retrieveTransactions(chainId, safe, nonce, notary, 0, 0);
		expect(page.length).to.equal(0);
		expect(count).to.equal(2);

		// Case 2: start > 0, count = 0
		[page, count] = await harbour.retrieveTransactions(chainId, safe, nonce, notary, 1, 0);
		expect(page.length).to.equal(0);
		expect(count).to.equal(2);

		// Case 3: count > totalCount
		[page, count] = await harbour.retrieveTransactions(chainId, safe, nonce, notary, 0, 10); // Ask for 10, only 2 exist
		expect(page.length).to.equal(2);
		expect(count).to.equal(2);

		// Case 4: start > 0, count > remaining
		[page, count] = await harbour.retrieveTransactions(chainId, safe, nonce, notary, 1, 10); // Ask for 10 starting at 1, only 1 left
		expect(page.length).to.equal(1);
		expect(count).to.equal(2);
	});

	it("should return zero via retrieveTransactionCount for unknown chainId/safe/nonce/signer", async () => {
		const { signer, notary, alice, harbour, chainId, safe, encryptionKey } = await loadFixture(deployFixture);

		const nonce = 11n;
		const otherSafe = ethers.getAddress(`0x${"efa5".repeat(10)}`);

		const safeTx = populateSafeTransaction({ nonce });
		const safeTxStructHash = getSafeTransactionStructHash(safeTx);
		const signature = await signSafeTransaction(signer, safe, chainId, safeTx);
		const encryptionBlob = await encryptSafeTransaction(safeTx, [encryptionKey]);
		await harbour.connect(notary).enqueueTransaction(chainId, safe, nonce, safeTxStructHash, signature, encryptionBlob);

		expect(await harbour.retrieveTransactionCount(chainId, safe, nonce, notary)).to.equal(1);

		expect(await harbour.retrieveTransactionCount(chainId + 1n, safe, nonce, notary)).to.equal(0);
		expect(await harbour.retrieveTransactionCount(chainId, otherSafe, nonce, notary)).to.equal(0);
		expect(await harbour.retrieveTransactionCount(chainId, safe, nonce + 1n, notary)).to.equal(0);
		expect(await harbour.retrieveTransactionCount(chainId, safe, nonce, alice)).to.equal(0);
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

		const registrationCount = await harbour.retrieveTransactionCount(chainId, safe, nonce, notary);
		expect(registrationCount).to.equal(5);
	});
});
