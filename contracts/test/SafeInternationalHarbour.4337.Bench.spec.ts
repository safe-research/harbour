import { AddressOne } from "@safe-global/safe-contracts";
import { type Signer, type TransactionReceipt, Wallet } from "ethers";
import { ethers } from "hardhat";
import { EntryPoint__factory, SafeInternationalHarbour__factory } from "../typechain-types";
import { buildSafeTx, buildSignedUserOp } from "./utils/erc4337";

const logGas = (label: string, tx: TransactionReceipt): void => {
	if (!tx || !tx.gasUsed) {
		console.warn(`⚠️  ${label.padEnd(12)} - Missing gasUsed info.`);
		return;
	}

	const formattedLabel = label.padEnd(12);
	const gasUsed = tx.gasUsed.toString(); // In case it's a BigNumber or similar

	console.log(`⛽ ${formattedLabel}: ${gasUsed}`);
};

describe("SafeInternationalHarbour 4337 [@bench]", () => {
	async function deployFixture() {
		const [deployer, alice] = await ethers.getSigners();
		const chainId = BigInt((await ethers.provider.getNetwork()).chainId);
		const EntryPointFactory = new EntryPoint__factory(deployer as unknown as Signer);
		const entryPoint = await EntryPointFactory.deploy();
		const HarbourFactory = new SafeInternationalHarbour__factory(deployer as unknown as Signer);
		const harbour = await HarbourFactory.deploy(entryPoint);

		const safeAddress = await alice.getAddress();
		return { entryPoint, deployer, alice, harbour, chainId, safeAddress };
	}

	it("Enqueuing a transaction with empty transaction data (native transfer)", async () => {
		const { entryPoint, deployer, harbour, chainId, safeAddress } = await deployFixture();
		const signerWallet = Wallet.createRandom();
		const safeTx = buildSafeTx({ to: deployer.address });
		const { userOp } = await buildSignedUserOp(harbour, signerWallet, chainId, safeAddress, safeTx);
		const tx = await entryPoint.handleOps([userOp], AddressOne);
		const receipt = (await tx.wait()) as TransactionReceipt;
		await logGas("native_transfer_0b", receipt);
	});

	it("Enqueuing a transaction with ERC20 transfer data (68 bytes)", async () => {
		const { entryPoint, harbour, chainId, safeAddress } = await deployFixture();
		const signerWallet = Wallet.createRandom();
		const recipient = Wallet.createRandom().address;
		const amount = 1n * 10n ** 18n;
		const erc20Iface = new ethers.Interface(["function transfer(address to,uint256 amount)"]);
		const data = erc20Iface.encodeFunctionData("transfer", [recipient, amount]);
		const safeTx = buildSafeTx({ to: recipient, data });
		const { userOp } = await buildSignedUserOp(harbour, signerWallet, chainId, safeAddress, safeTx);
		const tx = await entryPoint.handleOps([userOp], AddressOne);
		const receipt = (await tx.wait()) as TransactionReceipt;
		await logGas("erc20_transfer_68b", receipt);
	});

	it("Enqueuing a transaction with large transaction data", async () => {
		const { entryPoint, deployer, harbour, chainId, safeAddress } = await deployFixture();
		const signerWallet = Wallet.createRandom();
		const data = `0x${"ff".repeat(1024)}`;
		const safeTx = buildSafeTx({ to: deployer.address, data });
		const { userOp } = await buildSignedUserOp(harbour, signerWallet, chainId, safeAddress, safeTx);
		const tx = await entryPoint.handleOps([userOp], AddressOne);
		const receipt = (await tx.wait()) as TransactionReceipt;
		await logGas("large_tx_data_1024b", receipt);
	});

	it("Appending a signature to an existing transaction", async () => {
		const { entryPoint, deployer, harbour, chainId, safeAddress } = await deployFixture();
		const signerWallet1 = Wallet.createRandom();
		const safeTx = buildSafeTx({ to: deployer.address });
		const { userOp: userOp1 } = await buildSignedUserOp(harbour, signerWallet1, chainId, safeAddress, safeTx);
		await entryPoint.handleOps([userOp1], AddressOne);

		const signerWallet2 = Wallet.createRandom();
		const { userOp: userOp2 } = await buildSignedUserOp(harbour, signerWallet2, chainId, safeAddress, safeTx);
		const tx = await entryPoint.handleOps([userOp2], AddressOne);
		const receipt = (await tx.wait()) as TransactionReceipt;
		await logGas("append_sig_same_tx", receipt);
	});
});
