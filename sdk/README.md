# Harbour Protocol SDK

## Overview

The Harbour Protocol SDK provides a convenient way to interact with the Harbour protocol, a system designed for queuing and managing Gnosis Safe transactions. This SDK allows developers to retrieve transaction queues and enqueue new transactions for Safes on supported chains.

It is a lightweight, function-based library built with TypeScript and relies on `ethers.js` for blockchain interactions.

## Installation

To install the Harbour SDK, you can use npm or yarn. As this package may not be published to a public registry, you might install it from a local tarball, a Git repository, or a specific path if developing locally.

For a typical installation (assuming it's published or available in your project's scope):
```bash
npm install harbour-sdk 
# or
yarn add harbour-sdk
```
Replace `harbour-sdk` with the actual package name or path as appropriate.

## Core Concepts

The SDK is designed with a function-based approach for simplicity and ease of use. It does not require instantiating a class.

-   **Provider**: For read-only operations, such as fetching transaction queues (`getTransactions`), you'll need an `ethers.js` `Provider` instance connected to the appropriate blockchain network (where the Harbour contract is deployed).
-   **Signer**: For write operations, like submitting a new transaction to the queue (`enqueueTransaction`), an `ethers.js` `Signer` instance is required. The Signer must be connected to a Provider and have the private key of an authorized account.

## Usage

### Importing functions and types

```typescript
import { getTransactions, enqueueTransaction } from 'harbour-sdk';
// TransactionWithSignatures is also typically exported from the main entry point
import type { TransactionWithSignatures, SDKFullSafeTransaction, ChainId } from 'harbour-sdk'; 
// Note: If specific types like SDKFullSafeTransaction are not re-exported from the main package entry, 
// you might need to import them from a path like 'harbour-sdk/dist/types' after installation.

import { JsonRpcProvider, Wallet, ethers } from 'ethers'; // For examples
```

### Initializing Provider/Signer (Example)

```typescript
// Initialize a Provider (e.g., for Gnosis Chain where Harbour might be deployed)
const provider = new JsonRpcProvider('YOUR_GNOSIS_CHAIN_RPC_URL'); // Replace with your RPC URL

// For write operations, initialize a Signer
// Make sure this account has permissions/funds as needed for Harbour interactions
const privateKey = 'YOUR_PRIVATE_KEY'; // Keep private keys secure!
const signer = new Wallet(privateKey, provider);
```

### Example: `getTransactions`

This function retrieves queued transactions for a specific Safe nonce.

```typescript
async function fetchSafeQueue() {
  try {
    const safeAddress = '0xYourGnosisSafeAddress'; // Address of the Gnosis Safe
    const safeChainId: ChainId = 100; // Chain ID where the Safe is deployed (e.g., 100 for Gnosis Chain)
    const owners = ['0xOwnerAddress1', '0xOwnerAddress2']; // List of current Safe owners
    const nonceToFetch = 5; // The specific Safe nonce you want to query transactions for

    // Note: getTransactions interacts with the Harbour contract, so the `provider`
    // should be connected to the chain where Harbour is deployed.
    const transactions: TransactionWithSignatures[] = await getTransactions(
      provider,       // Provider for Harbour's chain
      safeAddress,
      safeChainId,    // Chain ID of the Safe itself
      owners,
      nonceToFetch
    );

    console.log(`Fetched Transactions for nonce ${nonceToFetch}:`, transactions);

    transactions.forEach(tx => {
      console.log('Transaction Details:', tx.details); // SDKTransactionDetails
      console.log('Signatures:', tx.signatures);     // SDKHarbourSignature[]
      console.log('SafeTxHash:', tx.safeTxHash);
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
  }
}

fetchSafeQueue();
```

### Example: `enqueueTransaction`

This function submits a new transaction to the Harbour queue.

```typescript
async function submitTransactionToHarbour() {
  try {
    // Details for the transaction to be executed by the Safe
    const transactionDetails: SDKFullSafeTransaction = {
      safeAddress: '0xYourGnosisSafeAddress',
      chainId: 100, // Chain ID of the Safe (e.g., 100 for Gnosis Chain)
      nonce: '5',   // The Safe's current nonce as a string
      to: '0xRecipientAddress',
      value: ethers.parseEther('0.01').toString(), // Example: 0.01 ETH
      data: '0x', // Optional transaction data
      operation: 0, // 0 for CALL, 1 for DELEGATECALL
      safeTxGas: '0', 
      baseGas: '0',
      gasPrice: '0',
      gasToken: '0x0000000000000000000000000000000000000000', // ETH or native token
      refundReceiver: '0x0000000000000000000000000000000000000000', // Optional
    };

    // This signature is specific to the Safe transaction (EIP-712)
    // and is usually collected from Safe owners.
    // For enqueueing into Harbour, this signature is passed through.
    const eip712SignatureFromSafeOwner = '0xYourEIP712SignatureForTransaction'; 

    // The `signer` here is for the account submitting to Harbour,
    // NOT necessarily a Safe owner. It pays gas on Harbour's chain.
    const receipt = await enqueueTransaction(
      signer, // Signer for Harbour's chain
      transactionDetails, 
      eip712SignatureFromSafeOwner
    );

    if (receipt && receipt.status === 1) {
      console.log('Transaction enqueued successfully on Harbour! Receipt Tx Hash:', receipt.transactionHash);
    } else {
      console.error('Harbour enqueue transaction failed or receipt was null. Status:', receipt?.status, 'Receipt:', receipt);
    }
  } catch (error) {
    console.error('Error enqueuing transaction to Harbour:', error);
  }
}

// Ensure your signer is correctly initialized with funds on Harbour's chain.
// submitTransactionToHarbour();
```

## API Documentation

For detailed API documentation, including specifics on all exported functions, interfaces, and types, please see the generated TypeDoc documentation:
[./docs/index.html](./docs/index.html) 
(Link might need adjustment based on where docs are hosted/served).

## Minimal Dependencies

This SDK aims for minimal runtime dependencies, primarily relying on `ethers.js`. Check `package.json` for the exact version of `ethers` and other development dependencies.
