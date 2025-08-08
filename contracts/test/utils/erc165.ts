import { ethers } from "hardhat";

async function computeInterfaceId(name: string): Promise<string> {
	const { interface: iface } = await ethers.getContractAt(name, ethers.ZeroAddress);
	let id = 0n;
	iface.forEachFunction((func) => {
		id = id ^ BigInt(func.selector);
	});
	return ethers.toBeHex(id, 4);
}

export { computeInterfaceId };
