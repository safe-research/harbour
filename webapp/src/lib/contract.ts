import type { InterfaceAbi } from "ethers";
import SafeConfigFetcherJson from "./abi/SafeConfigurationFetcher.json";

export const SAFE_CONFIG_FETCHER_ADDRESS = "0x4037fb99c0e810883007AeC38c7B712E18F80a3B";
export const SAFE_CONFIG_FETCHER_ABI = SafeConfigFetcherJson.abi as unknown as InterfaceAbi;

export interface SafeConfiguration {
	owners: string[];
	threshold: bigint;
	fallbackHandler: string;
	nonce: bigint;
	modules: string[];
	guard: string;
}
