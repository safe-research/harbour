import { type Address, type Client, getContract } from "viem";
import { HARBOUR_ABI } from "./constants.js";

// Note: we do not specify a return type as this allows TS to infer the function types
export const getHarbour = (harbourClient: Client, harbourAddress: Address) => {
	return getContract({
		address: harbourAddress,
		abi: HARBOUR_ABI,
		client: harbourClient,
	});
};
