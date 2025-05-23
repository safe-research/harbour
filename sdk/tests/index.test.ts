import { getTransactions, enqueueTransaction, TransactionWithSignatures } from '../src'; // Import functions
import { Provider, Signer, Contract, TransactionResponse, TransactionReceipt, Interface } from 'ethers';
import { SDKFullSafeTransaction, ChainId, SDKTransactionDetails, SDKHarbourSignature } from '../src/types';

// Define HARBOUR_ABI locally for the test file, as it's not exported from the SDK source
// and is needed for the Interface mock.
const HARBOUR_ADDRESS = "0x5E669c1f2F9629B22dd05FBff63313a49f87D4e6";
const HARBOUR_ABI = [
  "function enqueueTransaction(address safeAddress, uint256 chainId, uint256 nonce, address to, uint256 value, bytes data, uint8 operation, uint256 safeTxGas, uint256 baseGas, uint256 gasPrice, address gasToken, address refundReceiver, bytes signature) external",
  "function retrieveSignatures(address signerAddress, address safeAddress, uint256 chainId, uint256 nonce, uint256 start, uint256 count) external view returns (tuple(bytes32 r, bytes32 vs, bytes32 txHash)[] page, uint256 totalCount)",
  "function retrieveTransaction(bytes32 safeTxHash) view returns (tuple(bool stored,uint8 operation,address to,uint128 value,uint128 safeTxGas,uint128 baseGas,uint128 gasPrice,address gasToken,address refundReceiver,bytes data) txParams)",
];

// Mock ethers.Contract
const mockRetrieveSignatures = jest.fn();
const mockRetrieveTransaction = jest.fn();
const mockContractEnqueue = jest.fn();
const mockWait = jest.fn(); // For the receipt

// This object represents the mocked contract instance's methods
const mockContractInstance = {
  interface: new Interface(HARBOUR_ABI), // Use actual ABI for interface
  retrieveSignatures: mockRetrieveSignatures,
  retrieveTransaction: mockRetrieveTransaction,
  enqueueTransaction: mockContractEnqueue,
  // The `connect` method is part of the Contract prototype, but since we are creating a new Contract instance
  // within each function (getTransactions with provider, enqueueTransaction with signer),
  // we don't need to mock `connect` on the instance itself for these tests.
  // The test will verify that `new Contract` is called with the correct arguments (provider or signer).
};

jest.mock('ethers', () => {
  const originalEthers = jest.requireActual('ethers');
  return {
    ...originalEthers,
    Contract: jest.fn().mockImplementation(() => mockContractInstance),
  };
});

// Mock Provider and Signer instances
const mockProvider = {
  // getNetwork: jest.fn().mockResolvedValue({ chainId: 100 }), // Not strictly needed unless called by SDK
} as unknown as Provider;

const mockSigner = {
  provider: mockProvider, // Important: Signer needs a provider for enqueueTransaction's check
  getAddress: jest.fn().mockResolvedValue('0xSignerAddress'),
} as unknown as Signer;


// Sample data
const sampleSafeAddress = '0x123Safe';
const sampleChainId: ChainId = 100; // Should match HARBOUR_CHAIN_ID if that was relevant internal check
const sampleOwners = ['0xOwner1', '0xOwner2'];
const sampleNonce = 1;
const sampleTxHash1 = '0xtxHash100000000000000000000000000000000000000000000000000000000';
const sampleTxHash2 = '0xtxHash200000000000000000000000000000000000000000000000000000000';

const sampleFullTx: SDKFullSafeTransaction = {
  safeAddress: sampleSafeAddress,
  chainId: sampleChainId,
  nonce: '1',
  to: '0xRecipient',
  value: '1000000000000000000', // 1 ETH
  data: '0x',
  operation: 0,
  safeTxGas: '21000',
  baseGas: '0',
  gasPrice: '1000000000', // 1 gwei
  gasToken: '0x0000000000000000000000000000000000000000',
  refundReceiver: '0x0000000000000000000000000000000000000000',
};
const sampleSignature = '0xSignature';
const mockTxReceipt = {
  blockNumber: 12345,
  status: 1,
  transactionHash: '0xReceiptTxHash',
} as unknown as TransactionReceipt;


// Before each test, clear mock history
beforeEach(() => {
  (Contract as jest.Mock).mockClear();
  mockRetrieveSignatures.mockReset(); // Use mockReset to clear implementations and calls
  mockRetrieveTransaction.mockReset();
  mockContractEnqueue.mockReset();
  mockWait.mockReset();

  // Default successful transaction for enqueue
  mockContractEnqueue.mockResolvedValue({ wait: mockWait } as unknown as TransactionResponse);
  mockWait.mockResolvedValue(mockTxReceipt);
});


describe('Harbour SDK Functions', () => {

  describe('getTransactions', () => {
    it('should correctly fetch and assemble transactions with signatures', async () => {
      // Mock retrieveSignatures: Owner1 signs txHash1, Owner2 signs txHash1 and txHash2
      mockRetrieveSignatures
        .mockResolvedValueOnce([ // Owner1
            [{ r: '0xr_o1_t1', vs: '0xvs_o1_t1', txHash: sampleTxHash1 }],
            BigInt(1) // totalCount for Owner1
        ])
        .mockResolvedValueOnce([ // Owner2
          [
            { r: '0xr_o2_t1', vs: '0xvs_o2_t1', txHash: sampleTxHash1 },
            { r: '0xr_o2_t2', vs: '0xvs_o2_t2', txHash: sampleTxHash2 }
          ],
          BigInt(2) // totalCount for Owner2
        ]);

      // Mock retrieveTransaction for txHash1 and txHash2
      // Note: retrieveTransaction returns an array where the first element is the struct
      const tx1ContractDetails = [
        true, // stored
        0, // operation
        '0xRecipient1', // to
        BigInt('100000000000000000'), // value (0.1 ETH)
        BigInt('60000'), // safeTxGas
        BigInt('0'),   // baseGas
        BigInt('0'),   // gasPrice
        '0xGasTokenAddress1', // gasToken
        '0xRefundReceiver1',  // refundReceiver
        '0xData1' // data
      ];
      const tx2ContractDetails = [
        true, 1, '0xRecipient2', BigInt('200000000000000000'), BigInt('70000'),
        BigInt('0'), BigInt('0'), '0xGasTokenAddress2', '0xRefundReceiver2', '0xData2'
      ];

      mockRetrieveTransaction.mockImplementation(async (txHash: string) => {
        if (txHash === sampleTxHash1) return [tx1ContractDetails];
        if (txHash === sampleTxHash2) return [tx2ContractDetails];
        return [[false, 0, '', BigInt(0), BigInt(0), BigInt(0), BigInt(0), '', '', '']]; // Default for unexpected
      });


      const result = await getTransactions(mockProvider, sampleSafeAddress, sampleChainId, sampleOwners, sampleNonce);

      expect(Contract).toHaveBeenCalledTimes(1); // Called once inside getTransactions
      expect(Contract).toHaveBeenCalledWith(HARBOUR_ADDRESS, HARBOUR_ABI, mockProvider);

      expect(mockRetrieveSignatures).toHaveBeenCalledTimes(sampleOwners.length);
      expect(mockRetrieveSignatures).toHaveBeenCalledWith(sampleOwners[0], sampleSafeAddress, sampleChainId, sampleNonce, 0, 100);
      expect(mockRetrieveSignatures).toHaveBeenCalledWith(sampleOwners[1], sampleSafeAddress, sampleChainId, sampleNonce, 0, 100);

      expect(mockRetrieveTransaction).toHaveBeenCalledTimes(2); // Called for each unique txHash
      expect(mockRetrieveTransaction).toHaveBeenCalledWith(sampleTxHash1);
      expect(mockRetrieveTransaction).toHaveBeenCalledWith(sampleTxHash2);

      expect(result).toHaveLength(2);

      const tx1Result = result.find(tx => tx.safeTxHash === sampleTxHash1);
      expect(tx1Result).toBeDefined();
      expect(tx1Result?.details.to).toBe(tx1ContractDetails[2]);
      expect(tx1Result?.details.value).toBe(tx1ContractDetails[3].toString());
      expect(tx1Result?.signatures).toHaveLength(2);
      expect(tx1Result?.signatures.find(s => s.signer === sampleOwners[0])).toBeDefined();
      expect(tx1Result?.signatures.find(s => s.signer === sampleOwners[1])).toBeDefined();

      const tx2Result = result.find(tx => tx.safeTxHash === sampleTxHash2);
      expect(tx2Result).toBeDefined();
      expect(tx2Result?.details.to).toBe(tx2ContractDetails[2]);
      expect(tx2Result?.details.value).toBe(tx2ContractDetails[3].toString());
      expect(tx2Result?.signatures).toHaveLength(1);
      expect(tx2Result?.signatures.find(s => s.signer === sampleOwners[1])).toBeDefined();
    });

    it('should return an empty array if no signatures are found', async () => {
      mockRetrieveSignatures.mockResolvedValue([[], BigInt(0)]); // For all owner calls

      const result = await getTransactions(mockProvider, sampleSafeAddress, sampleChainId, sampleOwners, sampleNonce);

      expect(Contract).toHaveBeenCalledWith(HARBOUR_ADDRESS, HARBOUR_ABI, mockProvider);
      expect(mockRetrieveSignatures).toHaveBeenCalledTimes(sampleOwners.length);
      expect(mockRetrieveTransaction).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should not include transactions if retrieveTransaction returns stored: false', async () => {
      mockRetrieveSignatures.mockResolvedValueOnce([
          [{ r: '0xr1', vs: '0xvs1', txHash: sampleTxHash1 }], BigInt(1)
      ]);
      // For simplicity, assume only one owner or other owners have no signatures
      mockRetrieveSignatures.mockResolvedValue([[], BigInt(0)]);


      const txDetailsNotStored = [
        false, // stored
        0, '0xto1', BigInt(100), BigInt(60000), BigInt(0), BigInt(0), '0xToken', '0xRefund', '0xdata1'
      ];
      mockRetrieveTransaction.mockResolvedValueOnce([txDetailsNotStored]);

      const result = await getTransactions(mockProvider, sampleSafeAddress, sampleChainId, [sampleOwners[0]], sampleNonce);

      expect(mockRetrieveTransaction).toHaveBeenCalledWith(sampleTxHash1);
      expect(result).toEqual([]);
    });
  });

  describe('enqueueTransaction', () => {
    it('should successfully enqueue a transaction with a valid signer', async () => {
      const result = await enqueueTransaction(mockSigner, sampleFullTx, sampleSignature);

      // Contract is instantiated with the signer directly
      expect(Contract).toHaveBeenCalledTimes(1);
      expect(Contract).toHaveBeenCalledWith(HARBOUR_ADDRESS, HARBOUR_ABI, mockSigner);
      
      // No .connect call needed on the instance if instantiated with signer
      // expect(mockContractInstance.connect).not.toHaveBeenCalled(); 

      expect(mockContractEnqueue).toHaveBeenCalledTimes(1);
      expect(mockContractEnqueue).toHaveBeenCalledWith(
        sampleFullTx.safeAddress,
        sampleFullTx.chainId,
        sampleFullTx.nonce,
        sampleFullTx.to,
        sampleFullTx.value,
        sampleFullTx.data,
        sampleFullTx.operation,
        sampleFullTx.safeTxGas,
        sampleFullTx.baseGas,
        sampleFullTx.gasPrice,
        sampleFullTx.gasToken,
        sampleFullTx.refundReceiver,
        sampleSignature
      );
      expect(mockWait).toHaveBeenCalledTimes(1);
      expect(result).toBe(mockTxReceipt);
    });

    it('should throw an error if signer has no provider', async () => {
      const signerWithoutProvider = { 
        getAddress: jest.fn().mockResolvedValue('0xNoProvSigner') 
        // no 'provider' property
      } as unknown as Signer;

      await expect(enqueueTransaction(signerWithoutProvider, sampleFullTx, sampleSignature))
        .rejects
        .toThrow('Signer must be connected to a provider.');
      
      expect(Contract).not.toHaveBeenCalled(); // Contract instantiation should not happen if signer check fails
      expect(mockContractEnqueue).not.toHaveBeenCalled();
    });
  });
});
