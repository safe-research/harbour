import { loadFixture, time } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { AddressOne } from "@safe-global/safe-contracts";
import { expect } from "chai";
import { type BaseContract, type Signer, Wallet } from "ethers";
import { ethers } from "hardhat";
import {
	EntryPoint__factory,
	SafeHarbourPaymaster__factory,
	SafeInternationalHarbour__factory,
	TestToken__factory,
} from "../typechain-types";
import {
	build4337Config,
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
				maxFreeQuota: 100_000_000,
				quotaPerDepositedFeeToken: 10_000_000,
				feeToken: await testToken.getAddress(),
			}),
			buildSlashingConfig(),
		);
		await paymaster.deposit({ value: ethers.parseEther("1") });
		const HarbourFactory = new SafeInternationalHarbour__factory(deployer as unknown as Signer);
		const erc4337config = build4337Config({
			entryPoint: await entryPoint.getAddress(),
			trustedPaymaster: await paymaster.getAddress(),
		});
		const harbour = await HarbourFactory.deploy(
			erc4337config,
			buildQuotaConfig({ feeToken: await testToken.getAddress() }),
		);

		const safeAddress = await alice.getAddress();
		return { deployer, alice, harbour, chainId, safeAddress, entryPoint, paymaster, validator, testToken };
	}

	function _error(contract: BaseContract, name: string, values: unknown[] = []): string {
		return contract.interface.encodeErrorResult(name, values);
	}

	it("should store transaction parameters and use validator quota", async () => {
		const { harbour, chainId, safeAddress, entryPoint, validator, paymaster, testToken } =
			await loadFixture(deployFixture);

		const nextResetTimestamp = calculateNextQuotaReset(BigInt(await time.latest()), 0n);
		expect(await paymaster.availableFreeQuotaForSigner(validator)).to.be.deep.eq([0n, 0n, nextResetTimestamp]);

		await testToken.approve(paymaster, ethers.parseUnits("1", 18));
		await paymaster.depositTokensForSigner(validator, ethers.parseUnits("1", 18));
		expect(await paymaster.availableFreeQuotaForSigner(validator)).to.be.deep.eq([10_000_000n, 0n, nextResetTimestamp]);

		const signerWallet = Wallet.createRandom();
		const safeTx: SafeTransaction = {
			to: Wallet.createRandom().address,
			value: 1n,
			data: "0x1234",
			operation: 1, // DELEGATECALL
			safeTxGas: 100000n,
			baseGas: 21000n,
			gasPrice: 2n * 10n ** 9n, // 2 gwei
			gasToken: Wallet.createRandom().address,
			refundReceiver: Wallet.createRandom().address,
			nonce: 123n,
		};
		const paymasterAndData = await encodePaymasterData({ paymaster });
		const gasFees = {
			baseFee: 1n,
			priorityFee: 0n,
		};
		const { userOp } = await buildSignedUserOp(
			harbour,
			signerWallet,
			chainId,
			safeAddress,
			safeTx,
			paymasterAndData,
			gasFees,
		);
		await addValidatorSignature(chainId, entryPoint, userOp, validator);

		const updateTx = await entryPoint.handleOps([userOp], AddressOne);

		const nextResetTimestampAfterUpdate = await calculateNextQuotaResetFromTx(updateTx, 0n);
		const maxGas = calculateMaxGasUsageForUserOp(userOp);
		expect(await paymaster.availableFreeQuotaForSigner(validator)).to.be.deep.eq([
			10_000_000n - maxGas,
			maxGas,
			nextResetTimestampAfterUpdate,
		]);

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
});
