import { ethers, type JsonRpcApiProvider } from "ethers";

type Address = string;

/**
 * Relayer balance information.
 */
interface RelayerBalanceInfo {
	formatted: string;
	needsFunding: boolean;
	faucet?: string;
}

/**
 * Custom React Query hook to fetch the current relayer balance information.
 */
async function getRelayerBalanceInfo({
	relayer,
	provider,
}: {
	relayer: Address;
	provider: JsonRpcApiProvider;
}): Promise<RelayerBalanceInfo> {
	const { chainId } = await provider.getNetwork();
	const symbol = getNativeCurrencySymbol({ chainId });
	const balance = await provider.getBalance(relayer);
	const faucet = getFaucetUrl({ address: relayer, chainId });

	return {
		formatted: `${symbol} ${ethers.formatEther(balance)}`,
		needsFunding: balance === 0n,
		faucet: faucet,
	};
}

function getNativeCurrencySymbol({ chainId }: { chainId: bigint }) {
	if (chainId === 100n) {
		return "XDAI";
	}
	return "Ξ";
}

function getFaucetUrl({
	address,
	chainId,
}: {
	address: Address;
	chainId: bigint;
}) {
	if (chainId === 100n) {
		return `https://faucet.gnosischain.com/?address=${address}`;
	}
	return undefined;
}

export type { RelayerBalanceInfo };
export { getRelayerBalanceInfo };
