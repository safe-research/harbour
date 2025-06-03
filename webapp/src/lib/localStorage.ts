import { ethereumAddressSchema } from "./validators";

const ERC20_TOKEN_ADDRESSES_BY_CHAIN_KEY = "erc20TokenAddressesByChain";

/**
 * Retrieves the list of saved ERC20 token addresses from local storage for a specific chain.
 *
 * @param chainId - The chain ID to get token addresses for
 * @throws Will log an error if parsing fails and return an empty array.
 *
 * @returns An array of token addresses for the specified chain.
 */
export function getERC20TokenAddresses(chainId: number): string[] {
  const storedData = localStorage.getItem(ERC20_TOKEN_ADDRESSES_BY_CHAIN_KEY);
  if (storedData) {
    try {
      const parsedData = JSON.parse(storedData);
      if (typeof parsedData === "object" && parsedData !== null) {
        const chainAddresses = parsedData[chainId.toString()];
        if (
          Array.isArray(chainAddresses) &&
          chainAddresses.every((addr) =>
            Boolean(ethereumAddressSchema.parse(addr)),
          )
        ) {
          return chainAddresses;
        }
      }
    } catch (error) {
      console.error(
        "Error parsing ERC20 token addresses from local storage:",
        error,
      );
      // Fallback to returning an empty array if parsing fails
      return [];
    }
  }
  return [];
}

/**
 * Adds a new ERC20 token address to local storage for a specific chain.
 * Does nothing if the address is already present for that chain.
 * @param address The ERC20 token address to add.
 * @param chainId The chain ID to add the token address for.
 */
export function addERC20TokenAddress(address: string, chainId: number): void {
  const storedData = localStorage.getItem(ERC20_TOKEN_ADDRESSES_BY_CHAIN_KEY);
  let parsedData: Record<string, string[]> = {};

  if (storedData) {
    try {
      const parsed = JSON.parse(storedData);
      if (typeof parsed === "object" && parsed !== null) {
        parsedData = parsed;
      }
    } catch (error) {
      console.error(
        "Error parsing existing ERC20 token addresses from local storage:",
        error,
      );
    }
  }

  const chainKey = chainId.toString();
  const currentAddresses = parsedData[chainKey] || [];

  if (!currentAddresses.includes(address)) {
    parsedData[chainKey] = [...currentAddresses, address];
    localStorage.setItem(
      ERC20_TOKEN_ADDRESSES_BY_CHAIN_KEY,
      JSON.stringify(parsedData),
    );
  }
}

/**
 * Removes an ERC20 token address from local storage for a specific chain.
 * @param address The ERC20 token address to remove.
 * @param chainId The chain ID to remove the token address from.
 */
export function removeERC20TokenAddress(
  address: string,
  chainId: number,
): void {
  const storedData = localStorage.getItem(ERC20_TOKEN_ADDRESSES_BY_CHAIN_KEY);
  let parsedData: Record<string, string[]> = {};

  if (storedData) {
    try {
      const parsed = JSON.parse(storedData);
      if (typeof parsed === "object" && parsed !== null) {
        parsedData = parsed;
      }
    } catch (error) {
      console.error(
        "Error parsing existing ERC20 token addresses from local storage:",
        error,
      );
      return;
    }
  }

  const chainKey = chainId.toString();
  const currentAddresses = parsedData[chainKey] || [];
  const newAddresses = currentAddresses.filter((addr) => addr !== address);

  if (newAddresses.length === 0) {
    delete parsedData[chainKey];
  } else {
    parsedData[chainKey] = newAddresses;
  }

  localStorage.setItem(
    ERC20_TOKEN_ADDRESSES_BY_CHAIN_KEY,
    JSON.stringify(parsedData),
  );
}
