# Safe Module Transaction Queue

[SafeModuleTransactionRegistry](./contracts/SafeModuleTransactionRegistry.sol) is a contract that allows Safe module transactions to be queued before execution, facilitating Safe owners to fetch the queued transactions without depending on any off-chain entity for getting transaction details.

## Overview

The `SafeModuleTransactionRegistry` contract serves as a module for Safe smart contract wallets that enables:

- Queueing transactions for later execution
- Adding signatures incrementally (useful for multi-signature wallets)
- Executing transactions when sufficient owner signatures are collected
- Maintaining an on-chain record of pending transactions

## Key Features

- **On-chain Transaction Queue**: Store transaction details entirely on-chain
- **Incremental Signatures**: Add signatures at any time before execution
- **Multiple Transactions Per Nonce**: Queue multiple alternative transactions for the same nonce
- **Queue Invalidation**: All queued transactions can be invalidated by disabling the module. The transaction can possibly become valid again if the module is enabled again.

## Integration Guide

### 1. Enable the Module on Your Safe

First, enable the `SafeModuleTransactionRegistry` as a module on your Safe:

```javascript
// Example: Enable module on your Safe (using ethers.js)
const enableModuleData = safe.interface.encodeFunctionData("enableModule", [moduleAddress]);
const tx = await safe.execTransaction({
    to: safe.address,
    data: enableModuleData,
    operation: 0,
    // other parameters as needed
});
```

### 2. Queue a Transaction

You can queue a transaction with or without signatures:

```javascript
// Example: Queue a transaction
const transaction = {
    to: receiverAddress,
    value: ethers.parseEther("0.1"),
    data: "0x", // Empty calldata for simple transfers
    operation: 0, // 0 for Call, 1 for DelegateCall
    nonce: 0, // Current nonce of the safe in this module
    signatures: [] // Can be empty or include initial signatures
};

await safeModuleTransactionRegistry.registerSafeModuleTransaction(safeAddress, transaction);
```

### 3. Sign Transactions (EIP-712)

Generate and add signatures using EIP-712 typed data signing:

```javascript
const domain = {
    name: "SafeModuleTransactionRegistry",
    version: "1",
    chainId: await getChainId(),
    verifyingContract: moduleAddress
};

const types = {
    SafeModuleTransactionRegistry: [
        { name: "to", type: "address" },
        { name: "value", type: "uint256" },
        { name: "data", type: "bytes" },
        { name: "operation", type: "uint8" },
        { name: "nonce", type: "uint256" }
    ]
};

const value = {
    to: receiverAddress,
    value: ethers.parseEther("0.1"),
    data: "0x",
    operation: 0,
    nonce: 0
};

// Sign the transaction
const signature = await signer.signTypedData(domain, types, value);
const { v, r, s } = ethers.Signature.from(signature);

// Add the signature to the queued transaction
await safeModuleTransactionRegistry.registerSafeModuleTransactionSignature(
    safeAddress,
    0, // nonce
    0, // transaction index
    { v, r, s, dynamicPart: "0x" }
);
```

### 4. Execute the Transaction

When ready, execute the transaction:

```javascript
await safeModuleTransactionRegistry.execTransactionFromModule(
    safeAddress,
    0, // nonce
    0  // transaction index
);
```

## Error Handling

The contract uses custom error types:

- `NonceTooLow`: When trying to register a transaction with a nonce lower than current
- `InvalidTransactionIndex`: When providing an invalid transaction index
- `TransactionNotFound`: When the requested transaction doesn't exist
- `ModuleTransactionFailed`: When the module transaction execution fails
- `InvalidNonce`: When executing with an incorrect nonce

## Security Considerations

- The module can be disabled at any time by removing it from the Safe
- All signatures are verified by the Safe contract itself

## Development

Try running some of the following tasks:

```shell
npx hardhat help
npx hardhat test
REPORT_GAS=true npx hardhat test
npx hardhat node
```

## Warning

WARNING: THIS CODE IS NOT AUDITED. USE AT YOUR OWN RISK.
