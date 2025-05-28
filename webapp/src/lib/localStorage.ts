const ERC20_TOKEN_ADDRESSES_KEY = "erc20TokenAddresses";

/**
 * Retrieves the list of saved ERC20 token addresses from local storage.
 * @returns An array of token addresses.
 */
export function getERC20TokenAddresses(): string[] {
  const storedAddresses = localStorage.getItem(ERC20_TOKEN_ADDRESSES_KEY);
  if (storedAddresses) {
    try {
      const parsedAddresses = JSON.parse(storedAddresses);
      if (Array.isArray(parsedAddresses) && parsedAddresses.every(addr => typeof addr === 'string')) {
        return parsedAddresses;
      }
    } catch (error) {
      console.error("Error parsing ERC20 token addresses from local storage:", error);
      // Fallback to returning an empty array if parsing fails
      return [];
    }
  }
  return [];
}

/**
 * Adds a new ERC20 token address to local storage.
 * Does nothing if the address is already present.
 * @param address The ERC20 token address to add.
 */
export function addERC20TokenAddress(address: string): void {
  if (typeof address !== 'string' || !address.match(/^0x[a-fA-F0-9]{40}$/)) {
    console.error("Invalid address format provided to addERC20TokenAddress:", address);
    return;
  }
  const currentAddresses = getERC20TokenAddresses();
  if (!currentAddresses.includes(address)) {
    const newAddresses = [...currentAddresses, address];
    localStorage.setItem(ERC20_TOKEN_ADDRESSES_KEY, JSON.stringify(newAddresses));
  }
}

/**
 * Removes an ERC20 token address from local storage.
 * @param address The ERC20 token address to remove.
 */
export function removeERC20TokenAddress(address: string): void {
  const currentAddresses = getERC20TokenAddresses();
  const newAddresses = currentAddresses.filter(addr => addr !== address);
  localStorage.setItem(ERC20_TOKEN_ADDRESSES_KEY, JSON.stringify(newAddresses));
}
