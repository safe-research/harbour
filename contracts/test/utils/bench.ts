import type { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { loadFixture } from "@nomicfoundation/hardhat-toolbox/network-helpers";
import type { TransactionReceipt, TransactionResponse } from "ethers";
import { ethers } from "hardhat";
import { populateSafeTransaction, type SafeTransaction } from "./safeTx";

function logGas(label: string, tx: TransactionReceipt | null): void {
	const formattedLabel = label.padEnd(20);
	const gasUsed = tx?.gasUsed;
	if (gasUsed) {
		console.log(`⛽ ${formattedLabel}: ${tx.gasUsed}`);
	} else {
		console.warn(`⚠️  ${formattedLabel}: missing gas info`);
	}
}

type FixtureFunction<T> = (others: SignerWithAddress[]) => Promise<T>;
type BenchFixture<T> = {
	chainId: bigint;
	safe: string;
	deployer: SignerWithAddress;
	signer: SignerWithAddress;
	safeTx: SafeTransaction;
	existing?: true;
} & T;
type TransactionFunction<T> = (f: BenchFixture<T>) => Promise<TransactionResponse>;

const ERC20 = new ethers.Interface(["function transfer(address to, uint256 amount) returns (bool success)"]);

function describeBench<T>(name: string, fixture: FixtureFunction<T>, transact: TransactionFunction<T>) {
	describe(`${name} [@bench]`, () => {
		async function deployFixture() {
			const [deployer, signer, alice, ...others] = await ethers.getSigners();

			const chainId = 0x5afen;
			const safe = ethers.getAddress(`0x${"5afe".repeat(10)}`);

			const inner = await fixture(others);
			return { deployer, signer, alice, chainId, safe, inner };
		}

		function simpleBench(
			description: string,
			id: string,
			build: (args: { recipient: SignerWithAddress }) => Partial<SafeTransaction>,
		) {
			it(description, async () => {
				const { deployer, signer, chainId, safe, inner } = await loadFixture(deployFixture);

				const safeTx = populateSafeTransaction(build({ recipient: deployer }));
				const tx = await transact({ deployer, signer, chainId, safe, safeTx, ...inner });
				const receipt = await tx.wait();
				logGas(id, receipt);
			});
		}

		simpleBench("empty transaction", "empty_0b", () => ({}));

		simpleBench("native transfer", "native_transfer_0b", ({ recipient }) => ({
			to: recipient.address,
			value: ethers.parseEther("1.0"),
		}));

		simpleBench("ERC20 transfer (68 bytes)", "erc20_transfer_68b", ({ recipient }) => ({
			to: recipient.address,
			data: ERC20.encodeFunctionData("transfer", [recipient.address, ethers.parseEther("1.0")]),
		}));

		simpleBench("large transaction data", "large_tx_data_1024b", ({ recipient }) => ({
			to: recipient.address,
			data: `0x${"ff".repeat(1024)}`,
		}));

		it("additional signature to an existing transaction", async () => {
			const { deployer, signer, alice, chainId, safe, inner } = await loadFixture(deployFixture);

			const safeTx = populateSafeTransaction({ to: deployer.address });
			await transact({ deployer, signer: alice, chainId, safe, safeTx, ...inner });
			const tx = await transact({ deployer, signer, chainId, safe, safeTx, existing: true, ...inner });
			const receipt = await tx.wait();
			await logGas("append_sig_same_tx", receipt);
		});
	});
}

export type { FixtureFunction, BenchFixture, TransactionFunction };
export { describeBench };
