import type { BrowserProvider, JsonRpcApiProvider } from "ethers";
import type { SafeConfiguration } from "@/lib/safe";
import type { ChainId } from "@/lib/types";

interface CommonTransactionFormProps {
	/** The address of the Safe contract. */
	safeAddress: string;
	/** The chain ID where the Safe contract is deployed. */
	chainId: ChainId;
	/** An Ethers BrowserProvider instance from the connected wallet. */
	browserProvider: BrowserProvider;
	/** An Ethers JsonRpcApiProvider instance for the Safe's chain, used for fetching token details. */
	rpcProvider: JsonRpcApiProvider;
	/** The configuration of the Safe, including the current nonce. */
	config: SafeConfiguration;
}

interface ERC20TransferFormProps extends CommonTransactionFormProps {
	/** Optional pre-filled token address for the ERC20 transfer form. */
	tokenAddress?: string;
}

export type { CommonTransactionFormProps, ERC20TransferFormProps };
