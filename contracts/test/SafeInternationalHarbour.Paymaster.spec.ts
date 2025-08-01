import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { AddressOne } from "@safe-global/safe-contracts";
import { expect } from "chai";
import { type Signer, Wallet } from "ethers";
import { ethers } from "hardhat";
import { setGasParams } from "../tasks/actions/utils/bundlers";
import {
	EntryPoint__factory,
	SafeHarbourPaymaster__factory,
	SafeInternationalHarbour__factory,
	TestToken__factory,
} from "../typechain-types";
import {
	build4337Config,
	buildSafeTx,
	buildSignedUserOp,
	calculateMaxGasUsageForUserOp,
	encodePaymasterData,
} from "./utils/erc4337";
import {
	addValidatorSignature,
	buildQuotaConfig,
	calculateNextQuotaReset,
	calculateNextQuotaResetFromTx,
} from "./utils/quota";
import { getSafeTransactionHash, type SafeTransaction } from "./utils/safeTx";
import { buildSlashingConfig } from "./utils/slashing";

describe("SafeInternationalHarbour.Paymaster", () => {
	async function deployFixture() {
		const [deployer, alice, bob, charlie] = await ethers.getSigners();
		const validator = charlie as unknown as Signer;
		const testTokenFactory = new TestToken__factory(deployer as unknown as Signer);
		const testToken = await testTokenFactory.deploy();
		const chainId = BigInt((await ethers.provider.getNetwork()).chainId);
		const EntryPointFactory = new EntryPoint__factory(deployer as unknown as Signer);
		const entryPoint = await EntryPointFactory.deploy();
		const PaymasterFactory = new SafeHarbourPaymaster__factory(deployer as unknown as Signer);
		const paymaster = await PaymasterFactory.deploy(
			bob,
			entryPoint,
			buildQuotaConfig({
				maxAvailableQuota: 0,
				quotaPerFeeToken: 1_000,
				quotaPerFeeTokenScale: 0,
				feeToken: await testToken.getAddress(),
			}),
			buildSlashingConfig(),
		);
		await paymaster.deposit({ value: ethers.parseEther("1") });
		const HarbourFactory = new SafeInternationalHarbour__factory(deployer as unknown as Signer);
		const erc4337config = build4337Config({
			entryPoint: await entryPoint.getAddress(),
		});
		const harbour = await HarbourFactory.deploy(erc4337config);

		const safeAddress = await alice.getAddress();
		return { deployer, alice, harbour, chainId, safeAddress, entryPoint, paymaster, validator, testToken };
	}

	it("should store transaction parameters and use validator quota", async () => {
		const { harbour, chainId, safeAddress, entryPoint, validator, paymaster, testToken } =
			await loadFixture(deployFixture);

		const nextResetTimestamp = calculateNextQuotaReset(BigInt(await time.latest()), 0n);
		expect(await paymaster.availableFreeQuotaForSigner(validator)).to.be.deep.eq([0n, 0n, nextResetTimestamp]);

		await testToken.approve(paymaster, ethers.parseUnits("1", 18));
		await paymaster.depositTokensForSigner(validator, ethers.parseUnits("1", 18));
		const initialQuota = 1_000_000_000_000_000_000_000n;
		expect(await paymaster.availableFreeQuotaForSigner(validator)).to.be.deep.eq([
			initialQuota,
			0n,
			nextResetTimestamp,
		]);

		const signerWallet = Wallet.createRandom();
		const safeTx: SafeTransaction = buildSafeTx({ to: "0xF4f42442E2AE1d7Ea87087aF73B2Abb5536290C2" });
		const paymasterAndData = await encodePaymasterData({ paymaster });
		const { userOp } = await buildSignedUserOp(harbour, signerWallet, 100n, safeAddress, safeTx, paymasterAndData);
		const gasFee = {
			maxFeePerGas: "0xb00",
			maxPriorityFeePerGas: "0xf4240",
		};
		const limits = {
			preVerificationGas: "0xcf5c",
			verificationGasLimit: "0xf091",
			callGasLimit: "0x27c9d",
			paymasterVerificationGasLimit: "0x6ed8",
			paymasterPostOpGasLimit: "0x1",
		};
		setGasParams(userOp, gasFee, limits);
		await addValidatorSignature(chainId, entryPoint, userOp, validator);

		const updateTx = await entryPoint.handleOps([userOp], AddressOne);

		const nextResetTimestampAfterUpdate = await calculateNextQuotaResetFromTx(updateTx, 0n);
		const maxGas = calculateMaxGasUsageForUserOp(userOp);
		const maxCosts = maxGas * BigInt(gasFee.maxFeePerGas);
		expect(await paymaster.availableFreeQuotaForSigner(validator)).to.be.deep.eq([
			initialQuota - maxCosts,
			maxCosts,
			nextResetTimestampAfterUpdate,
		]);

		const safeTxHash = getSafeTransactionHash(safeAddress, 100n, safeTx);
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
});
