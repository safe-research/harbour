import { type Signer, type TransactionReceipt, ZeroAddress } from "ethers";
import { ethers } from "hardhat";
import { SafeInternationalHarbour__factory } from "../typechain-types";
import { EIP712_SAFE_TX_TYPE, type SafeTransaction } from "./utils/safeTx";

const logGas = (label: string, tx: TransactionReceipt): void => {
	if (!tx || !tx.gasUsed) {
		console.warn(`⚠️  ${label.padEnd(12)} - Missing gasUsed info.`);
		return;
	}

	const formattedLabel = label.padEnd(12);
	const gasUsed = tx.gasUsed.toString(); // In case it's a BigNumber or similar

	console.log(`⛽ ${formattedLabel}: ${gasUsed}`);
};

describe("SafeInternationalHarbour [@bench]", () => {
	async function deployFixture() {
		const [deployer, alice] = await ethers.getSigners();
		const chainId = BigInt((await ethers.provider.getNetwork()).chainId);
		const Factory = new SafeInternationalHarbour__factory(deployer as unknown as Signer);
		const harbour = await Factory.deploy(ZeroAddress);

		const safeAddress = await alice.getAddress();
		return { deployer, alice, harbour, chainId, safeAddress };
	}

	it("Enqueuing a transaction with empty transaction data (native transfer)", async () => {
		const { deployer, harbour, chainId, safeAddress } = await deployFixture();
		const signerWallet = ethers.Wallet.createRandom();
		const safeTx: SafeTransaction = {
			to: deployer.address,
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
		const signature = await signerWallet.signTypedData(
			{ chainId, verifyingContract: safeAddress },
			EIP712_SAFE_TX_TYPE,
			safeTx,
		);
		const tx = await harbour.enqueueTransaction(
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
		const receipt = (await tx.wait()) as TransactionReceipt;
		await logGas("native_transfer_0b", receipt);
	});

	it("Enqueuing a transaction with ERC20 transfer data (68 bytes)", async () => {
		const { harbour, chainId, safeAddress } = await deployFixture();
		const signerWallet = ethers.Wallet.createRandom();
		const recipient = ethers.Wallet.createRandom().address;
		const amount = 1n * 10n ** 18n;
		const erc20Iface = new ethers.Interface(["function transfer(address to,uint256 amount)"]);
		const data = erc20Iface.encodeFunctionData("transfer", [recipient, amount]);
		const safeTx: SafeTransaction = {
			to: recipient,
			value: 0n,
			data,
			operation: 0,
			safeTxGas: 0n,
			baseGas: 0n,
			gasPrice: 0n,
			gasToken: ethers.ZeroAddress,
			refundReceiver: ethers.ZeroAddress,
			nonce: 0n,
		};
		const signature = await signerWallet.signTypedData(
			{ chainId, verifyingContract: safeAddress },
			EIP712_SAFE_TX_TYPE,
			safeTx,
		);
		const tx = await harbour.enqueueTransaction(
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
		const receipt = (await tx.wait()) as TransactionReceipt;
		await logGas("erc20_transfer_68b", receipt);
	});

	it("Enqueuing a transaction with large transaction data", async () => {
		const { deployer, harbour, chainId, safeAddress } = await deployFixture();
		const signerWallet = ethers.Wallet.createRandom();
		const data = `0x${"ff".repeat(1024)}`;
		const safeTx: SafeTransaction = {
			to: deployer.address,
			value: 0n,
			data,
			operation: 0,
			safeTxGas: 0n,
			baseGas: 0n,
			gasPrice: 0n,
			gasToken: ethers.ZeroAddress,
			refundReceiver: ethers.ZeroAddress,
			nonce: 0n,
		};
		const signature = await signerWallet.signTypedData(
			{ chainId, verifyingContract: safeAddress },
			EIP712_SAFE_TX_TYPE,
			safeTx,
		);
		const tx = await harbour.enqueueTransaction(
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
		const receipt = (await tx.wait()) as TransactionReceipt;
		await logGas("large_tx_data_1024b", receipt);
	});

	it("Appending a signature to an existing transaction", async () => {
		const { deployer, harbour, chainId, safeAddress } = await deployFixture();
		const signerWallet1 = ethers.Wallet.createRandom();
		const safeTx: SafeTransaction = {
			to: deployer.address,
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
		const signature1 = await signerWallet1.signTypedData(
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
			signature1,
		);
		const signerWallet2 = ethers.Wallet.createRandom();
		const signature2 = await signerWallet2.signTypedData(
			{ chainId, verifyingContract: safeAddress },
			EIP712_SAFE_TX_TYPE,
			safeTx,
		);
		const tx = await harbour.enqueueTransaction(
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
		);
		const receipt = (await tx.wait()) as TransactionReceipt;
		await logGas("append_sig_same_tx", receipt);
	});
});
