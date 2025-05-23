import { Contract, Provider, Signer, Interface, TransactionResponse, TransactionReceipt } from 'ethers';
import type { ChainId, SDKTransactionDetails, SDKHarbourSignature, SDKFullSafeTransaction } from './types';

// Constants for Harbour contract
// These constants are intended to be internal to the SDK module.
// If they were needed by tests or other external modules, they would be moved to a constants.ts and exported.
const HARBOUR_CHAIN_ID: ChainId = 100;
const HARBOUR_ADDRESS = "0x5E669c1f2F9629B22dd05FBff63313a49f87D4e6";

const HARBOUR_ABI = [
  "function enqueueTransaction(address safeAddress, uint256 chainId, uint256 nonce, address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signature) external",
  "function retrieveSignatures(address signerAddress, address safeAddress, uint256 chainId, uint256 nonce, uint256 start, uint256 count) external view returns (tuple(bytes32 r, bytes32 vs, bytes32 txHash)[] page, uint256 totalCount)",
  "function retrieveTransaction(bytes32 safeTxHash) view returns (tuple(bool stored,uint8 operation,address to,uint128 value,uint128 safeTxGas,uint128 baseGas,uint128 gasPrice,address gasToken,address refundReceiver,bytes data) txParams)",
];

/**
 * Represents a Safe transaction along with its collected signatures and unique transaction hash.
 * This interface is specific to the output of the `getTransactions` function.
 */
export interface TransactionWithSignatures {
  /** The details of the Safe transaction. */
  details: SDKTransactionDetails;
  /** An array of signatures collected for the transaction. */
  signatures: SDKHarbourSignature[];
  /** The unique transaction hash (SafeTxHash). */
  safeTxHash: string;
}

/**
 * Retrieves transactions and their signatures for a specific Safe nonce from Harbour.
 *
 * @param provider - An ethers.js Provider instance.
 * @param safeAddress - The address of the Safe contract.
 * @param safeChainId - The chain ID where the Safe contract is deployed.
 * @param owners - An array of owner addresses for the Safe.
 * @param nonce - The specific nonce to fetch transactions for.
 * @returns A promise that resolves to an array of transactions with their signatures.
 */
export async function getTransactions(
  provider: Provider,
  safeAddress: string,
  safeChainId: ChainId,
  owners: string[],
  nonce: number
): Promise<TransactionWithSignatures[]> {
  const contract = new Contract(HARBOUR_ADDRESS, HARBOUR_ABI, provider);
  const iface = contract.interface; // Interface for HARBOUR_ABI

  const signaturesByTxHash = new Map<string, SDKHarbourSignature[]>();
  const uniqueTxHashes = new Set<string>();

  // Retrieve Signatures
  for (const owner of owners) {
    const ownerSignaturesResult = await contract.retrieveSignatures(
      owner,
      safeAddress,
      safeChainId,
      nonce,
      0, // start
      100 // count - assuming a max of 100 signatures per owner per nonce
    );

    // The result is an array where the first element is the page of signatures
    const ownerSignatures = ownerSignaturesResult[0] as Array<[string, string, string]>;

    for (const sigTuple of ownerSignatures) {
      const harbourSignature: SDKHarbourSignature = {
        r: sigTuple[0],
        vs: sigTuple[1],
        txHash: sigTuple[2],
        signer: owner,
      };
      uniqueTxHashes.add(harbourSignature.txHash);
      const existingSignatures = signaturesByTxHash.get(harbourSignature.txHash) || [];
      existingSignatures.push(harbourSignature);
      signaturesByTxHash.set(harbourSignature.txHash, existingSignatures);
    }
  }

  // Retrieve Transaction Details
  const transactionDetailsMap = new Map<string, SDKTransactionDetails>();
  for (const txHash of Array.from(uniqueTxHashes)) {
    const txParamsResult = await contract.retrieveTransaction(txHash);
    
    // The result is an array where the first element is the txParams tuple
    const txParams = txParamsResult[0];

    if (txParams && txParams.stored) {
      transactionDetailsMap.set(txHash, {
        to: txParams.to,
        value: txParams.value.toString(),
        data: txParams.data,
        operation: Number(txParams.operation),
        stored: txParams.stored,
        safeTxGas: txParams.safeTxGas.toString(),
        baseGas: txParams.baseGas.toString(),
        gasPrice: txParams.gasPrice.toString(),
        gasToken: txParams.gasToken,
        refundReceiver: txParams.refundReceiver,
      });
    }
  }

  // Assemble Results
  const results: TransactionWithSignatures[] = [];
  for (const [txHash, signatures] of signaturesByTxHash.entries()) {
    const details = transactionDetailsMap.get(txHash);
    if (details) { // Ensure details were fetched and transaction was marked as stored
      results.push({
        details,
        signatures,
        safeTxHash: txHash,
      });
    }
  }

  return results;
}

/**
 * Enqueues a Safe transaction to the Harbour contract.
 *
 * @param signer - An ethers.js Signer instance for signing the transaction.
 * @param transaction - The full details of the Safe transaction to enqueue.
 * @param signature - The EIP-712 signature for the transaction.
 * @returns A promise that resolves to the transaction receipt once mined, or null if the transaction is replaced or dropped.
 * @throws If the signer is not connected to a provider.
 */
export async function enqueueTransaction(
  signer: Signer,
  transaction: SDKFullSafeTransaction,
  signature: string
): Promise<TransactionReceipt | null> {
  if (!signer.provider) {
    throw new Error("Signer must be connected to a provider.");
  }

  // The contract needs to be connected to the signer to send a transaction
  const contract = new Contract(HARBOUR_ADDRESS, HARBOUR_ABI, signer);

  const txResponse: TransactionResponse = await contract.enqueueTransaction(
    transaction.safeAddress,
    transaction.chainId,
    transaction.nonce,
    transaction.to,
    transaction.value,
    transaction.data,
    transaction.operation,
    transaction.safeTxGas,
    transaction.baseGas,
    transaction.gasPrice,
    transaction.gasToken,
    transaction.refundReceiver,
    signature
  );

  return txResponse.wait();
}
