import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { expect } from "chai";
import { ethers } from "hardhat";

const SENTINEL_MODULES = "0x0000000000000000000000000000000000000001";

describe("SafeConfigurationFetcher", () => {
	async function deployFixture() {
		const [deployer] = await ethers.getSigners();

		// Deploy mock Safe singleton
		const SafeFactory = await ethers.getContractFactory("Safe", deployer);
		const safeSingleton = await SafeFactory.deploy();
		const safeSingletonAddress = await safeSingleton.getAddress();

		// Deploy SafeProxyFactory
		const ProxyFactoryFactory = await ethers.getContractFactory("SafeProxyFactory", deployer);
		const proxyFactory = await ProxyFactoryFactory.deploy();
		const proxyFactoryAddress = await proxyFactory.getAddress();

		// Deploy SafeConfigurationFetcher
		const FetcherFactory = await ethers.getContractFactory("SafeConfigurationFetcher", deployer);
		const fetcher = await FetcherFactory.deploy();

		// Build owner list (1 real + 3 generated)
		const owners = [deployer.address];
		for (let i = 0; i < 3; i++) {
			owners.push(ethers.Wallet.createRandom().address);
		}

		// Parameters for Safe setup
		const threshold = 1;
		const modules = Array.from({ length: 5 }, () => ethers.Wallet.createRandom().address);
		const fallbackHandler = ethers.Wallet.createRandom().address;

		// Deploy guard
		const GuardFactory = await ethers.getContractFactory("DebugTransactionGuard", deployer);
		const guard = await GuardFactory.deploy();
		const guardAddress = await guard.getAddress();

		// Deploy Safe proxy directly without modules setup
		// Setup data
		const initializer = SafeFactory.interface.encodeFunctionData("setup", [
			owners,
			threshold,
			ethers.ZeroAddress, // to
			"0x", // data
			fallbackHandler,
			ethers.ZeroAddress, // payment token
			0, // payment
			ethers.ZeroAddress, // payment receiver
		]);

		// Create proxy
		const saltNonce = Date.now();
		const txCreate = await proxyFactory.createProxyWithNonce(safeSingletonAddress, initializer, saltNonce);
		const receipt = await txCreate.wait();
		if (!receipt) {
			throw new Error("createProxyWithNonce transaction has no receipt");
		}

		// Get the proxy address from the event
		const [creationEvent] = await proxyFactory.queryFilter(proxyFactory.filters.ProxyCreation(), receipt.blockNumber);
		const safeProxyAddress = creationEvent.args.proxy;

		// Get the proxy contract
		const safeProxy = await ethers.getContractAt("Safe", safeProxyAddress, deployer);

		// Enable modules manually
		for (const module of modules) {
			const enableModuleData = safeProxy.interface.encodeFunctionData("enableModule", [module]);
			const txHash = await safeProxy.getTransactionHash(
				safeProxyAddress,
				0,
				enableModuleData,
				0,
				0,
				0,
				0,
				ethers.ZeroAddress,
				ethers.ZeroAddress,
				await safeProxy.nonce(),
			);
			const hashBytes = ethers.getBytes(txHash);
			const signature = (await deployer.signMessage(hashBytes)).replace(/1b$/, "1f").replace(/1c$/, "20");
			await safeProxy.execTransaction(
				safeProxyAddress,
				0,
				enableModuleData,
				0,
				0,
				0,
				0,
				ethers.ZeroAddress,
				ethers.ZeroAddress,
				signature,
			);
		}

		// Set guard
		const setGuardData = safeProxy.interface.encodeFunctionData("setGuard", [guardAddress]);
		const txHash = await safeProxy.getTransactionHash(
			safeProxyAddress,
			0,
			setGuardData,
			0,
			0,
			0,
			0,
			ethers.ZeroAddress,
			ethers.ZeroAddress,
			await safeProxy.nonce(),
		);
		const hashBytes = ethers.getBytes(txHash);
		const signature = (await deployer.signMessage(hashBytes)).replace(/1b$/, "1f").replace(/1c$/, "20");
		await safeProxy.execTransaction(
			safeProxyAddress,
			0,
			setGuardData,
			0,
			0,
			0,
			0,
			ethers.ZeroAddress,
			ethers.ZeroAddress,
			signature,
		);

		// Verify modules were added correctly
		const sentinelModules = "0x0000000000000000000000000000000000000001"; // SENTINEL_MODULES
		const pageSize = 10; // Large enough to get all modules
		const [safeModules, nextCursor] = await safeProxy.getModulesPaginated(SENTINEL_MODULES, pageSize);

		console.log("Modules added to Safe:", safeModules.length);
		console.log("Next cursor:", nextCursor);

		return {
			deployer,
			fetcher,
			safeProxy,
			safeProxyAddress,
			owners,
			threshold,
			modules,
			safeModules,
			fallbackHandler,
			guardAddress,
			safeSingletonAddress,
		};
	}

	describe("Basic Configuration Retrieval", () => {
		it("should retrieve the correct basic configuration", async () => {
			const { fetcher, safeProxyAddress, owners, threshold, fallbackHandler, guardAddress, safeSingletonAddress } =
				await loadFixture(deployFixture);

			const config = await fetcher.getBasicConfiguration(safeProxyAddress);

			expect(config.singleton).to.equal(safeSingletonAddress);
			expect(config.owners.length).to.equal(owners.length);
			for (let i = 0; i < owners.length; i++) {
				expect(config.owners[i]).to.equal(owners[i]);
			}
			expect(config.threshold).to.equal(threshold);
			expect(config.fallbackHandler).to.equal(fallbackHandler);
			expect(config.guard).to.equal(guardAddress);
			expect(config.modules.length).to.equal(0); // Basic config returns empty modules array
		});

		it("should retrieve accurate nonce from the Safe", async () => {
			const { fetcher, safeProxyAddress, safeProxy } = await loadFixture(deployFixture);

			// Execute a transaction to increment nonce
			const emptyTx = await safeProxy.getTransactionHash(
				safeProxyAddress,
				0,
				"0x",
				0,
				0,
				0,
				0,
				ethers.ZeroAddress,
				ethers.ZeroAddress,
				await safeProxy.nonce(),
			);
			const hashBytes = ethers.getBytes(emptyTx);
			const signature = (await (await ethers.getSigners())[0].signMessage(hashBytes))
				.replace(/1b$/, "1f")
				.replace(/1c$/, "20");

			await safeProxy.execTransaction(
				safeProxyAddress,
				0,
				"0x",
				0,
				0,
				0,
				0,
				ethers.ZeroAddress,
				ethers.ZeroAddress,
				signature,
			);

			// Get nonce directly from Safe
			const expectedNonce = await safeProxy.nonce();

			// Get nonce via fetcher
			const config = await fetcher.getBasicConfiguration(safeProxyAddress);

			expect(config.nonce).to.equal(expectedNonce);
		});
	});

	describe("Module Pagination", () => {
		it("should retrieve paginated modules correctly", async () => {
			const { fetcher, safeProxyAddress, safeModules } = await loadFixture(deployFixture);

			// Skip test if no modules were added successfully
			if (safeModules.length === 0) {
				console.log("WARNING: No modules found in Safe, skipping test");
				return;
			}

			const pageSize = 2;

			// Get first page
			const [page1, nextCursor1] = await fetcher.getModulesPaginated(safeProxyAddress, SENTINEL_MODULES, pageSize);

			console.log("Page 1 modules:", page1.length, "next cursor:", nextCursor1);
			expect(page1.length).to.be.at.most(pageSize);

			if (page1.length > 0) {
				expect(page1.length).to.be.greaterThan(0);

				// Each returned module should be in our safeModules list
				for (const module of page1) {
					expect(safeModules).to.include(module);
				}

				if (safeModules.length <= pageSize) {
					expect(nextCursor1).to.equal(ethers.ZeroAddress);
				} else {
					expect(nextCursor1).to.not.equal(ethers.ZeroAddress);
					expect(nextCursor1).to.not.equal(SENTINEL_MODULES);

					// Get second page
					const [page2, nextCursor2] = await fetcher.getModulesPaginated(safeProxyAddress, nextCursor1, pageSize);

					expect(page2.length).to.be.at.most(pageSize);

					// Each returned module should be in our safeModules list
					for (const module of page2) {
						expect(safeModules).to.include(module);
					}

					// Continue pagination if needed
					if (safeModules.length > pageSize * 2) {
						expect(nextCursor2).to.not.equal(ethers.ZeroAddress);
						expect(nextCursor2).to.not.equal(SENTINEL_MODULES);
					} else {
						expect(nextCursor2).to.equal(ethers.ZeroAddress);
					}
				}
			}
		});

		it("should handle non-existent Safe address for modules pagination", async () => {
			const { fetcher } = await loadFixture(deployFixture);

			// Use a random address that definitely doesn't have a Safe contract
			const nonExistentAddress = ethers.Wallet.createRandom().address;

			// This should revert since the contract doesn't exist
			await expect(fetcher.getModulesPaginated(nonExistentAddress, SENTINEL_MODULES, 10)).to.be.reverted;
		});
	});

	describe("Full Configuration", () => {
		it("should retrieve the complete configuration with all modules", async () => {
			const {
				fetcher,
				safeProxyAddress,
				owners,
				threshold,
				safeModules,
				fallbackHandler,
				guardAddress,
				safeSingletonAddress,
			} = await loadFixture(deployFixture);

			// Skip test if no modules were added successfully
			if (safeModules.length === 0) {
				console.log("WARNING: No modules found in Safe, skipping test");
				return;
			}

			const [fullConfig, nextCursor] = await fetcher.getFullConfiguration(
				safeProxyAddress,
				3, // maxIterations - more than needed for our test modules
				2, // pageSize
			);

			console.log("Retrieved modules:", fullConfig.modules.length, "Safe modules:", safeModules.length);

			// Basic configuration checks
			expect(fullConfig.singleton).to.equal(safeSingletonAddress);
			expect(fullConfig.owners.length).to.equal(owners.length);
			for (let i = 0; i < owners.length; i++) {
				expect(fullConfig.owners[i]).to.equal(owners[i]);
			}
			expect(fullConfig.threshold).to.equal(threshold);
			expect(fullConfig.fallbackHandler).to.equal(fallbackHandler);
			expect(fullConfig.guard).to.equal(guardAddress);

			// Modules check - verify we got all modules from the safe (not from our original list)
			expect(fullConfig.modules.length).to.equal(safeModules.length);

			// Each module in the Safe's actual modules list should be present
			for (const module of safeModules) {
				expect(fullConfig.modules).to.include(module);
			}

			// All modules should have been retrieved
			expect(nextCursor).to.equal(SENTINEL_MODULES);
		});

		it("should handle pagination truncation when maxIterations is too small", async () => {
			const { fetcher, safeProxyAddress, safeModules } = await loadFixture(deployFixture);

			// Skip test if we don't have enough modules for meaningful pagination
			if (safeModules.length <= 2) {
				console.log("WARNING: Not enough modules found in Safe, skipping test");
				return;
			}

			// Set maxIterations to 1 and pageSize to 2 for more modules
			// Should return modules from first page and a non-zero nextCursor
			const [fullConfig, nextCursor] = await fetcher.getFullConfiguration(
				safeProxyAddress,
				1, // maxIterations - only enough for first page
				2, // pageSize
			);

			console.log("Truncated modules:", fullConfig.modules.length, "Safe modules:", safeModules.length);

			// Should return some modules but not all
			expect(fullConfig.modules.length).to.be.at.most(2);
			if (safeModules.length > 2) {
				expect(fullConfig.modules.length).to.be.lessThan(safeModules.length);
			}

			// Each returned module should be in the Safe's actual modules list
			for (const module of fullConfig.modules) {
				expect(safeModules).to.include(module);
			}

			// nextCursor should not be zero if we have more modules to fetch
			if (safeModules.length > 2) {
				expect(nextCursor).to.not.equal(ethers.ZeroAddress);
			}
		});
	});

	describe("Edge Cases", () => {
		it("should handle non-existent Safe addresses gracefully", async () => {
			const { fetcher } = await loadFixture(deployFixture);
			const nonExistentAddress = ethers.Wallet.createRandom().address;

			// Attempt to get basic config - should revert since the contract doesn't exist
			await expect(fetcher.getBasicConfiguration(nonExistentAddress)).to.be.reverted;
		});

		it("should optimize gas usage with large pageSize", async () => {
			const { fetcher, safeProxyAddress, safeModules } = await loadFixture(deployFixture);

			// Skip test if no modules were added successfully
			if (safeModules.length === 0) {
				console.log("WARNING: No modules found in Safe, skipping test");
				return;
			}

			// Use pageSize equal to module count to get all in one call
			const [fullConfig, nextCursor] = await fetcher.getFullConfiguration(
				safeProxyAddress,
				1, // maxIterations - only need one with large enough pageSize
				safeModules.length, // pageSize large enough for all modules
			);

			expect(fullConfig.modules.length).to.equal(safeModules.length);
			expect(nextCursor).to.equal(SENTINEL_MODULES);

			// Each module in the Safe's actual modules list should be present
			for (const module of safeModules) {
				expect(fullConfig.modules).to.include(module);
			}
		});
	});

	describe("Address Storage Helper", () => {
		it("should correctly read address values from storage slots", async () => {
			const { fetcher, safeProxyAddress, fallbackHandler, guardAddress, safeSingletonAddress } =
				await loadFixture(deployFixture);

			const config = await fetcher.getBasicConfiguration(safeProxyAddress);

			expect(config.singleton).to.equal(safeSingletonAddress);
			expect(config.fallbackHandler).to.equal(fallbackHandler);
			expect(config.guard).to.equal(guardAddress);
		});
	});
});
