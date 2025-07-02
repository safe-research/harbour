// SPDX-License-Identifier: GNU GPLv3
pragma solidity ^0.8.29;

import {
    HandlerContext
} from "@safe-global/safe-contracts/contracts/handler/HandlerContext.sol";
import {IAccount} from "@account-abstraction/contracts/interfaces/IAccount.sol";
import {
    IEntryPoint
} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {
    PackedUserOperation
} from "@account-abstraction/contracts/interfaces/PackedUserOperation.sol";
import {
    _packValidationData
} from "@account-abstraction/contracts/core/Helpers.sol";
import {
    UserOperationLib
} from "@account-abstraction/contracts/core/UserOperationLib.sol";
import "../interfaces/Errors.sol";
import "../interfaces/AbstractHarbourStore.sol";
import "../libs/CoreLib.sol";

abstract contract ERC4337Mixin is IAccount, IHarbourStore {
    // ------------------------------------------------------------------
    // 4337 functions
    // ------------------------------------------------------------------

    /**
     * @notice The address of the EntryPoint contract supported by this module.
     */
    address public immutable SUPPORTED_ENTRYPOINT;

    constructor(address _entryPoint) {
        SUPPORTED_ENTRYPOINT = _entryPoint;
    }

    /**
     * Return the account nonce.
     * This method returns the next sequential nonce.
     * For a nonce of a specific key, use `entrypoint.getNonce(account, key)`
     */
    function getNonce(address signer) public view virtual returns (uint256) {
        return
            IEntryPoint(SUPPORTED_ENTRYPOINT).getNonce(
                address(this),
                uint192(uint160(signer))
            );
    }

    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32,
        uint256 missingAccountFunds
    ) external override returns (uint256 validationData) {
        // Assumption:
        //   - UserOp signature is SafeTx signature
        // Requirements:
        //   - [x] Check entrypoint
        //   - [x] No paymaster support
        // Steps:
        //   - [x] decode callData
        //   - [x] recover signer from SafeTx signature
        //   - [x] check that signer has not submitted signature
        //   - [x] check that nonce key is signer address
        //   - [x] pay missing funds
        //   - [ ] usage checks -> set validation data

        require(
            msg.sender == SUPPORTED_ENTRYPOINT,
            InvalidEntryPoint(msg.sender)
        );
        require(
            userOp.paymasterAndData.length == 0,
            InvalidUserOpPaymasterAndData()
        );
        require(userOp.signature.length == 65, InvalidECDSASignatureLength());

        require(
            bytes4(userOp.callData) == this.storeTransaction.selector,
            InvalidTarget(bytes4(userOp.callData))
        );
        (
            bytes32 safeTxHash,
            address signer,
            bytes32 r,
            bytes32 vs
        ) = _verifySafeTxHash(userOp.callData[4:]);

        // --- DUPLICATE TRANSACTION SIGNATURE CHECK ---
        // Revert if this signer has already submitted *any* signature for this *exact* safeTxHash
        require(
            !_signerSignedTx(safeTxHash, signer),
            SignerAlreadySignedTransaction(signer, safeTxHash)
        );

        _verifySignature(safeTxHash, userOp.signature, signer, r, vs);

        uint256 nonce = getNonce(signer);
        require(userOp.nonce == nonce, UnexpectedNonce(nonce));

        // We trust the entry point to set the correct prefund value, based on the operation params
        // We need to perform this even if the signature is not valid, else the simulation function of the entry point will not work.
        if (missingAccountFunds != 0) {
            // We intentionally ignore errors in paying the missing account funds, as the entry point is responsible for
            // verifying the prefund has been paid. This behaviour matches the reference base account implementation.
            (bool success, ) = payable(msg.sender).call{
                value: missingAccountFunds
            }("");
            (success);
        }

        return _packValidationData(false, 0, 0);
    }

    function _verifySafeTxHash(
        bytes calldata callData
    ) private pure returns (bytes32, address, bytes32, bytes32) {
        (
            bytes32 safeTxHash,
            address safeAddress,
            uint256 chainId,
            uint256 nonce,
            address to,
            uint256 value,
            bytes memory data,
            uint8 operation,
            uint256 safeTxGas,
            uint256 baseGas,
            uint256 gasPrice,
            address gasToken,
            address refundReceiver,
            address signer,
            bytes32 r,
            bytes32 vs
        ) = abi.decode(
                callData,
                (
                    bytes32,
                    address,
                    uint256,
                    uint256,
                    address,
                    uint256,
                    bytes,
                    uint8,
                    uint256,
                    uint256,
                    uint256,
                    address,
                    address,
                    address,
                    bytes32,
                    bytes32
                )
            );
        bytes32 computedSafeTxHash = CoreLib._computeSafeTxHash(
            safeAddress,
            chainId,
            nonce,
            to,
            value,
            data,
            operation,
            safeTxGas,
            baseGas,
            gasPrice,
            gasToken,
            refundReceiver
        );

        require(
            computedSafeTxHash == safeTxHash,
            UnexpectedSafeTxHash(computedSafeTxHash)
        );
        return (safeTxHash, signer, r, vs);
    }

    function _verifySignature(
        bytes32 safeTxHash,
        bytes calldata signature,
        address signer,
        bytes32 r,
        bytes32 vs
    ) private pure {
        (
            address recoveredSigner,
            bytes32 extractedR,
            bytes32 extractedVS
        ) = CoreLib._recoverSigner(safeTxHash, signature);
        require(signer == recoveredSigner, UnexpectedSigner(signer));
        require(r == extractedR, UnexpectedSignatureR(r));
        require(vs == extractedVS, UnexpectedSignatureVS(vs));
    }

    function storeTransaction(
        bytes32 safeTxHash,
        address safeAddress,
        uint256 chainId,
        uint256 nonce,
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation,
        uint256 safeTxGas,
        uint256 baseGas,
        uint256 gasPrice,
        address gasToken,
        address refundReceiver,
        address signer,
        bytes32 r,
        bytes32 vs
    ) external returns (uint256 listIndex) {
        require(
            msg.sender == SUPPORTED_ENTRYPOINT,
            InvalidEntryPoint(msg.sender)
        );
        _storeTransaction(
            safeTxHash,
            safeAddress,
            chainId,
            nonce,
            to,
            value,
            data,
            operation,
            safeTxGas,
            baseGas,
            gasPrice,
            gasToken,
            refundReceiver
        );
        return
            _storeSignature(
                signer,
                safeAddress,
                chainId,
                nonce,
                safeTxHash,
                r,
                vs
            );
    }
}
