import { Interface, type JsonRpcApiProvider } from "ethers";
import { aggregateMulticall } from "./multicall";

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
	"function transfer(address to, uint256 amount) returns (bool)",
	"function approve(address sepender, uint256 amount) returns (bool)",
];

/**
 * Fetches details (name, symbol, decimals) and balance for an ERC20 token.
 * @param provider Ethers.js provider instance.
 * @param tokenAddress The address of the ERC20 token contract.
 * @param ownerAddress The address of the owner for whom to fetch the balance.
 * @returns A promise that resolves to an ERC20TokenDetails object or null if an error occurs.
 */
async function fetchERC20TokenDetails(
	provider: JsonRpcApiProvider,
	tokenAddress: string,
	ownerAddress: string,
): Promise<ERC20TokenDetails | null> {
	const iface = new Interface(ERC20_ABI);

	const calls = [
		{ target: tokenAddress, callData: iface.encodeFunctionData("name", []) },
		{ target: tokenAddress, callData: iface.encodeFunctionData("symbol", []) },
		{
			target: tokenAddress,
			callData: iface.encodeFunctionData("decimals", []),
		},
		{
			target: tokenAddress,
			callData: iface.encodeFunctionData("balanceOf", [ownerAddress]),
		},
	];
	const results = await aggregateMulticall(provider, calls);
	if (results.length !== 4)
		throw new Error("Unexpected multicall response length");
	const [nameRes, symbolRes, decRes, balRes] = results;
	if (
		!nameRes.success ||
		!symbolRes.success ||
		!decRes.success ||
		!balRes.success
	) {
		console.error(`Multicall failure for token ${tokenAddress}`);
		return null;
	}

	const name = iface.decodeFunctionResult(
		"name",
		nameRes.returnData,
	)[0] as string;
	const symbol = iface.decodeFunctionResult(
		"symbol",
		symbolRes.returnData,
	)[0] as string;
	const decimalsRaw = iface.decodeFunctionResult(
		"decimals",
		decRes.returnData,
	)[0] as bigint | number;
	const balance = iface.decodeFunctionResult(
		"balanceOf",
		balRes.returnData,
	)[0] as bigint;

	const numericDecimals = Number(decimalsRaw);
	if (
		Number.isNaN(numericDecimals) ||
		numericDecimals < 0 ||
		numericDecimals > 255
	) {
		console.error(
			`Invalid decimals value from ${tokenAddress}: ${decimalsRaw}`,
		);
		return null;
	}

	return {
		address: tokenAddress,
		name,
		symbol,
		decimals: numericDecimals,
		balance,
	};
}

/**
 * Batch fetch ERC20 token details for multiple tokens via Multicall3.
 * @param provider Ethers provider
 * @param tokenAddresses Array of token contract addresses
 * @param ownerAddress Address whose balance to fetch
 * @returns Array of ERC20TokenDetails|null for each token
 */
async function fetchBatchERC20TokenDetails(
	provider: JsonRpcApiProvider,
	tokenAddresses: string[],
	ownerAddress: string,
): Promise<(ERC20TokenDetails | null)[]> {
	const iface = new Interface(ERC20_ABI);
	const calls = tokenAddresses.flatMap((token) => [
		{ target: token, callData: iface.encodeFunctionData("name", []) },
		{ target: token, callData: iface.encodeFunctionData("symbol", []) },
		{ target: token, callData: iface.encodeFunctionData("decimals", []) },
		{
			target: token,
			callData: iface.encodeFunctionData("balanceOf", [ownerAddress]),
		},
	]);
	const results = await aggregateMulticall(provider, calls);
	const details = tokenAddresses.map((token, i) => {
		const offset = i * 4;
		const [nRes, sRes, dRes, bRes] = results.slice(offset, offset + 4);
		if (!nRes.success || !sRes.success || !dRes.success || !bRes.success) {
			console.error(`Multicall failed for token ${token}`);
			return null;
		}
		try {
			const name = iface.decodeFunctionResult(
				"name",
				nRes.returnData,
			)[0] as string;
			const symbol = iface.decodeFunctionResult(
				"symbol",
				sRes.returnData,
			)[0] as string;
			const decimalsRaw = iface.decodeFunctionResult(
				"decimals",
				dRes.returnData,
			)[0] as bigint | number;
			const balance = iface.decodeFunctionResult(
				"balanceOf",
				bRes.returnData,
			)[0] as bigint;
			const decimals =
				typeof decimalsRaw === "bigint"
					? Number(decimalsRaw)
					: Number(decimalsRaw);

			return { address: token, name, symbol, decimals, balance };
		} catch (e) {
			console.error(`Decode error for token ${token}:`, e);
			return null;
		}
	});
	return details;
}

/**
 * Encodes ERC20 transfer function call data.
 * @param recipient The address to transfer tokens to.
 * @param amount The amount of tokens to transfer (in smallest unit, e.g., wei for ETH).
 * @returns The encoded function call data as a hex string.
 */
function encodeERC20Transfer(recipient: string, amount: bigint): string {
	const iface = new Interface(ERC20_ABI);
	return iface.encodeFunctionData("transfer", [recipient, amount]);
}

/**
 * Encodes ERC20 approve function call data.
 * @param spender The address that can spend the tokens.
 * @param amount The amount of tokens that can be spent (in smallest unit, e.g., wei for ETH).
 * @returns The encoded function call data as a hex string.
 */
function encodeERC20Approval(spender: string, amount: bigint): string {
	const iface = new Interface(ERC20_ABI);
	return iface.encodeFunctionData("approve", [spender, amount]);
}

export {
	ERC20_ABI,
	type ERC20TokenDetails,
	encodeERC20Transfer,
	encodeERC20Approval,
	fetchBatchERC20TokenDetails,
	fetchERC20TokenDetails,
};
