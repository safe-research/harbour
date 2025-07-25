import { AddressOne } from "@safe-global/safe-contracts";
import { type Signer, toBigInt, type TransactionReceipt, Wallet } from "ethers";
import { ethers } from "hardhat";
import { EntryPoint__factory, SafeHarbourPaymaster__factory, SafeInternationalHarbour__factory } from "../typechain-types";
import { build4337Config, buildSafeTx, buildSignedUserOp, encodePaymasterData } from "./utils/erc4337";
import { addValidatorSignature, buildQuotaConfig } from "./utils/quota";
import { TestToken__factory } from "../typechain-types/factories/src/test/TestQuotaManager.sol";
import { buildSlashingConfig } from "./utils/slashing";

const logGas = (label: string, tx: TransactionReceipt): void => {
	if (!tx || !tx.gasUsed) {
		console.warn(`⚠️  ${label.padEnd(12)} - Missing gasUsed info.`);
		return;
	}

	const formattedLabel = label.padEnd(12);
	const gasUsed = tx.gasUsed.toString(); // In case it's a BigNumber or similar

	console.log(`⛽ ${formattedLabel}: ${gasUsed}`);
};

describe("SafeInternationalHarbour Paymaster [@bench]", () => {
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
		await testToken.approve(paymaster, ethers.parseUnits("1", 18));
		await paymaster.depositTokensForSigner(validator, ethers.parseUnits("1", 18));

		const HarbourFactory = new SafeInternationalHarbour__factory(deployer as unknown as Signer);
		const erc4337config = build4337Config({
			entryPoint: await entryPoint.getAddress(),
			trustedPaymaster: await paymaster.getAddress(),
		});
		const harbour = await HarbourFactory.deploy(erc4337config, buildQuotaConfig());

		const paymasterAndData = await encodePaymasterData({ paymaster });
		const gasFee = {
			maxFeePerGas: toBigInt("0xb00"),
			maxPriorityFeePerGas: toBigInt("0xf4240"),
		};

		const safeAddress = await alice.getAddress();
		return { entryPoint, deployer, alice, harbour, chainId, safeAddress, gasFee, paymasterAndData, validator };
	}

	it("Enqueuing a transaction with empty transaction data (native transfer)", async () => {
		const { entryPoint, deployer, harbour, chainId, safeAddress, gasFee, paymasterAndData, validator } = await deployFixture();
		const signerWallet = Wallet.createRandom();
		const safeTx = buildSafeTx({ to: deployer.address });
		const { userOp } = await buildSignedUserOp(harbour, signerWallet, chainId, safeAddress, safeTx, paymasterAndData, gasFee);
		await addValidatorSignature(chainId, entryPoint, userOp, validator);
		const tx = await entryPoint.handleOps([userOp], deployer);
		const receipt = (await tx.wait()) as TransactionReceipt;
		await logGas("native_transfer_0b", receipt);
	});

	it("Enqueuing a transaction with ERC20 transfer data (68 bytes)", async () => {
		const { deployer, entryPoint, harbour, chainId, safeAddress, paymasterAndData, gasFee, validator } = await deployFixture();
		const signerWallet = Wallet.createRandom();
		const recipient = Wallet.createRandom().address;
		const amount = 1n * 10n ** 18n;
		const erc20Iface = new ethers.Interface(["function transfer(address to,uint256 amount)"]);
		const data = erc20Iface.encodeFunctionData("transfer", [recipient, amount]);
		const safeTx = buildSafeTx({ to: recipient, data });
		const { userOp } = await buildSignedUserOp(harbour, signerWallet, chainId, safeAddress, safeTx, paymasterAndData, gasFee);
		await addValidatorSignature(chainId, entryPoint, userOp, validator);
		const tx = await entryPoint.handleOps([userOp], deployer);
		const receipt = (await tx.wait()) as TransactionReceipt;
		await logGas("erc20_transfer_68b", receipt);
	});

	it("Enqueuing a transaction with large transaction data", async () => {
		const { entryPoint, deployer, harbour, chainId, safeAddress, paymasterAndData, gasFee, validator } = await deployFixture();
		const signerWallet = Wallet.createRandom();
		const data = `0x${"ff".repeat(1024)}`;
		const safeTx = buildSafeTx({ to: deployer.address, data });
		const { userOp } = await buildSignedUserOp(harbour, signerWallet, chainId, safeAddress, safeTx, paymasterAndData, gasFee);
		await addValidatorSignature(chainId, entryPoint, userOp, validator);
		const tx = await entryPoint.handleOps([userOp], deployer);
		const receipt = (await tx.wait()) as TransactionReceipt;
		await logGas("large_tx_data_1024b", receipt);
	});

	it("Appending a signature to an existing transaction", async () => {
		const { entryPoint, deployer, harbour, chainId, safeAddress, paymasterAndData, gasFee, validator } = await deployFixture();
		const signerWallet1 = Wallet.createRandom();
		const safeTx = buildSafeTx({ to: deployer.address });
		const { userOp: userOp1 } = await buildSignedUserOp(harbour, signerWallet1, chainId, safeAddress, safeTx, paymasterAndData, gasFee);
		await addValidatorSignature(chainId, entryPoint, userOp1, validator);
		await entryPoint.handleOps([userOp1], deployer);

		const signerWallet2 = Wallet.createRandom();
		const { userOp: userOp2 } = await buildSignedUserOp(harbour, signerWallet2, chainId, safeAddress, safeTx, paymasterAndData, gasFee);
		await addValidatorSignature(chainId, entryPoint, userOp2, validator);
		const tx = await entryPoint.handleOps([userOp2], deployer);
		const receipt = (await tx.wait()) as TransactionReceipt;
		await logGas("append_sig_same_tx", receipt);
	});
});
