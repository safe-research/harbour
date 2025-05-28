import { Contract, type Provider as EthersProvider } from "ethers"; // Adjust Provider type as needed

interface ERC20TokenDetails {
	address: string;
	name: string;
	symbol: string;
	decimals: number;
	balance: bigint;
}

const ERC20_ABI = [
	"function name() view returns (string)",
	"function symbol() view returns (string)",
	"function decimals() view returns (uint8)",
	"function balanceOf(address account) view returns (uint256)",
];

/**
 * Fetches details (name, symbol, decimals) and balance for an ERC20 token.
 * @param provider Ethers.js provider instance.
 * @param tokenAddress The address of the ERC20 token contract.
 * @param ownerAddress The address of the owner for whom to fetch the balance.
 * @returns A promise that resolves to an ERC20TokenDetails object or null if an error occurs.
 */
async function fetchERC20TokenDetails(
	provider: EthersProvider, // Using the imported Provider type alias
	tokenAddress: string,
	ownerAddress: string,
): Promise<ERC20TokenDetails | null> {
	try {
		// Basic validation for addresses
		if (!tokenAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
			console.error(`Invalid token address format: ${tokenAddress}`);
			return null;
		}
		if (!ownerAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
			console.error(`Invalid owner address format: ${ownerAddress}`);
			return null;
		}

		const tokenContract = new Contract(tokenAddress, ERC20_ABI, provider);

		// Validate if the address is a contract
		const code = await provider.getCode(tokenAddress);
		if (code === "0x" || code === null) {
			// code can also be null if network error or other issues
			console.error(`Address ${tokenAddress} is not a contract or unable to fetch code.`);
			return null;
		}

		// Using Promise.allSettled to get all results even if one fails, though individual call errors are caught by the outer try/catch here.
		// For this specific case, Promise.all is fine because if one essential detail (like name or symbol) fails,
		// the whole token detail object is likely invalid.
		const [nameResult, symbolResult, decimalsResult, balanceResult] = await Promise.allSettled([
			tokenContract.name(),
			tokenContract.symbol(),
			tokenContract.decimals(),
			tokenContract.balanceOf(ownerAddress),
		]);

		// Check results from Promise.allSettled
		if (nameResult.status === "rejected") {
			console.error(`Error fetching name for token ${tokenAddress}:`, nameResult.reason);
			return null;
		}
		if (symbolResult.status === "rejected") {
			console.error(`Error fetching symbol for token ${tokenAddress}:`, symbolResult.reason);
			return null;
		}
		if (decimalsResult.status === "rejected") {
			console.error(`Error fetching decimals for token ${tokenAddress}:`, decimalsResult.reason);
			return null;
		}
		if (balanceResult.status === "rejected") {
			console.error(
				`Error fetching balance for token ${tokenAddress} for owner ${ownerAddress}:`,
				balanceResult.reason,
			);
			return null;
		}

		const name = nameResult.value;
		const symbol = symbolResult.value;
		const decimals = decimalsResult.value; // This will be BigInt from ethers v6 for uint8
		const balance = balanceResult.value; // This will be BigInt

		// Ensure decimals is a number before returning
		// In ethers.js v6, uint8 (decimals) is returned as a BigInt.
		// We need to convert it to a number.
		let numericDecimals: number;
		if (typeof decimals === "bigint") {
			numericDecimals = Number(decimals);
		} else if (typeof decimals === "number") {
			// Should not happen with ethers v6 for uint8, but good for robustness
			numericDecimals = decimals;
		} else {
			console.error(`Invalid decimals type received from ${tokenAddress}: ${typeof decimals}`);
			return null;
		}

		if (Number.isNaN(numericDecimals) || numericDecimals < 0 || numericDecimals > 255) {
			// uint8 range
			console.error(`Invalid decimals value received from ${tokenAddress}: ${decimals}`);
			return null;
		}

		// Validate other values if necessary (e.g., name and symbol should be strings)
		if (typeof name !== "string" || typeof symbol !== "string") {
			console.error(`Invalid name or symbol received from ${tokenAddress}. Name: ${name}, Symbol: ${symbol}`);
			return null;
		}

		// Ensure balance is a BigInt
		if (typeof balance !== "bigint") {
			console.error(`Invalid balance type received from ${tokenAddress}: ${typeof balance}`);
			return null;
		}

		return {
			address: tokenAddress,
			name,
			symbol,
			decimals: numericDecimals,
			balance,
		};
	} catch (error) {
		// This catch block will handle errors like network issues, or if tokenAddress is not a valid address format for Contract constructor
		console.error(`General error fetching details for token ${tokenAddress}:`, error);
		return null;
	}
}

export { ERC20_ABI, fetchERC20TokenDetails, type ERC20TokenDetails };
