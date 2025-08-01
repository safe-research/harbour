// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.29;

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
import {
    InvalidECDSASignatureLength,
    InvalidEntryPoint,
    InvalidTarget,
    SignerAlreadySignedTransaction,
    UnexpectedNonce,
    InvalidUserOpPaymaster,
    UnexpectedUserSignature,
    UnexpectedSafeTxHash,
    UnexpectedSigner
} from "../interfaces/Errors.sol";
import {IHarbourStore} from "../interfaces/HarbourStore.sol";
import {IQuotaManager} from "../interfaces/QuotaManager.sol";
import {PaymasterLib} from "../libs/PaymasterLib.sol";
import {CoreLib} from "../libs/CoreLib.sol";

struct ERC4337MixinConfig {
    address entryPoint;
}

abstract contract ERC4337Mixin is IAccount, IHarbourStore {
    using UserOperationLib for PackedUserOperation;
    using PaymasterLib for PackedUserOperation;

    // ------------------------------------------------------------------
    // 4337 functions
    // ------------------------------------------------------------------

    /**
     * @notice The address of the EntryPoint contract supported by this module.
     */
    address public immutable SUPPORTED_ENTRYPOINT;

    constructor(ERC4337MixinConfig memory _config) {
        SUPPORTED_ENTRYPOINT = _config.entryPoint;
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
        uint256
    ) external override view returns (uint256 validationData) {
        require(
            msg.sender == SUPPORTED_ENTRYPOINT,
            InvalidEntryPoint(msg.sender)
        );
        // TODO: remove as signature check should happen in paymaster
        require(
            userOp.signature.length == 65 || userOp.signature.length == 0,
            InvalidECDSASignatureLength()
        );

        require(
            bytes4(userOp.callData) == this.storeTransaction.selector,
            InvalidTarget(bytes4(userOp.callData))
        );
        (
            bytes32 safeTxHash,
            address signer,
            bytes32 r,
            bytes32 vs
        ) = _verifySafeTxData(userOp.callData[4:]);

        // --- DUPLICATE TRANSACTION SIGNATURE CHECK ---
        // Revert if this signer has already submitted *any* signature for this *exact* safeTxHash
        require(
            !_signerSignedTx(safeTxHash, signer),
            SignerAlreadySignedTransaction(signer, safeTxHash)
        );

        _verifySignature(safeTxHash, signer, r, vs);

        uint256 nonce = getNonce(signer);
        // TODO: This is done by the entrypoint and we only need to check that the signer is the key
        // https://github.com/eth-infinitism/account-abstraction/blob/develop/contracts/core/NonceManager.sol#L37
        require(userOp.nonce == nonce, UnexpectedNonce(nonce));

        // We skip the check that missingAccountFunds should be == 0, as this is the job of the entry point

        // Harbour can only be used with a paymaster when using 4337
        require(userOp.paymasterAndData.length > 0, InvalidUserOpPaymaster());
        return _packValidationData(false, 0, 0);
    }

    function _verifySafeTxData(
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
        bytes32 computedSafeTxHash = CoreLib.computeSafeTxHash(
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
        // The computed length when properly encoded is based on the data length and the number of params
        // 4 bytes selector + 15 params each 32 bytes + 32 bytes offset of data + 32 bytes length of data + data length + 32 bytes buffer for padding
        return (safeTxHash, signer, r, vs);
    }

    function _verifySignature(
        bytes32 safeTxHash,
        address signer,
        bytes32 r,
        bytes32 vs
    ) private pure {
        (address recoveredSigner) = CoreLib.recoverSigner(safeTxHash, r, vs);
        require(signer == recoveredSigner, UnexpectedSigner(signer));
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
