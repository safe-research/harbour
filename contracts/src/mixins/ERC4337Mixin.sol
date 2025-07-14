// SPDX-License-Identifier: GPL-3.0-only
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
import "../interfaces/HarbourStore.sol";
import "../interfaces/QuotaManager.sol";
import "../libs/CoreLib.sol";

abstract contract ERC4337Mixin is IAccount, IHarbourStore, IQuotaManager {
    using UserOperationLib for PackedUserOperation;

    struct ERC4337MixinConfig {
        address entryPoint;
        uint256 maxPriorityFee;
        uint256 preVerificationGasPerByte;
        uint256 preVerificationBaseGas;
        uint256 verificationGasPerByte;
        uint256 callGasPerByte;
        address trustedPaymaster;
    }

    // ------------------------------------------------------------------
    // 4337 functions
    // ------------------------------------------------------------------

    /**
     * @notice The address of the EntryPoint contract supported by this module.
     */
    address public immutable SUPPORTED_ENTRYPOINT;
    // TODO evaluate if this should be upgradable
    uint256 public immutable MAX_PRIORITY_FEE;
    uint256 public immutable PRE_VERIFICATION_GAS_PER_BYTE;
    uint256 public immutable PRE_VERIFICATION_BASE_GAS;
    uint256 public immutable VERIFICATION_GAS_PER_BYTE;
    uint256 public immutable CALL_GAS_PER_BYTE;
    address public immutable TRUSTED_PAYMASTER;

    constructor(ERC4337MixinConfig memory _config) {
        SUPPORTED_ENTRYPOINT = _config.entryPoint;
        MAX_PRIORITY_FEE = _config.maxPriorityFee;
        PRE_VERIFICATION_GAS_PER_BYTE = _config.preVerificationGasPerByte;
        PRE_VERIFICATION_BASE_GAS = _config.preVerificationBaseGas;
        VERIFICATION_GAS_PER_BYTE = _config.verificationGasPerByte;
        CALL_GAS_PER_BYTE = _config.callGasPerByte;
        TRUSTED_PAYMASTER = _config.trustedPaymaster;
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
        //   - [x] check limits on fee params
        //   - [ ] usage checks

        require(
            msg.sender == SUPPORTED_ENTRYPOINT,
            InvalidEntryPoint(msg.sender)
        );
        require(userOp.signature.length == 65, InvalidECDSASignatureLength());

        // Since paymasterAndData are not signed it is possible to to replace the paymaster
        // TODO: To evaluate if we should encode the used paymaster into the refund receiver
        if (userOp.paymasterAndData.length != 0) {
            address paymaster = address(
                bytes20(
                    userOp.paymasterAndData[
                        :UserOperationLib.PAYMASTER_VALIDATION_GAS_OFFSET
                    ]
                )
            );
            require(paymaster == TRUSTED_PAYMASTER, InvalidUserOpPaymaster());
        }

        require(
            bytes4(userOp.callData) == this.storeTransaction.selector,
            InvalidTarget(bytes4(userOp.callData))
        );
        (
            bytes32 safeTxHash,
            address signer,
            bytes32 r,
            bytes32 vs,
            uint256 computedDataLength
        ) = _verifySafeTxData(userOp.callData[4:]);

        // --- DUPLICATE TRANSACTION SIGNATURE CHECK ---
        // Revert if this signer has already submitted *any* signature for this *exact* safeTxHash
        require(
            !_signerSignedTx(safeTxHash, signer),
            SignerAlreadySignedTransaction(signer, safeTxHash)
        );

        _verifySignature(safeTxHash, userOp.signature, signer, r, vs);

        uint256 nonce = getNonce(signer);
        require(userOp.nonce == nonce, UnexpectedNonce(nonce));

        // We skip the check that missingAccountFunds should be == 0, as this is the job of the entry point

        // `computedDataLength` is used for validations, as userOp.callData can be extended to manipulate the fees
        bool validationFailed = !_validGasFees(userOp) ||
            !_validGasLimits(userOp, computedDataLength) ||
            !_checkAndUpdateQuota(signer, computedDataLength);
        return _packValidationData(validationFailed, 0, 0);
    }

    function _validGasFees(
        PackedUserOperation calldata userOp
    ) private view returns (bool) {
        uint256 maxPriorityFeePerGas = userOp.unpackMaxPriorityFeePerGas();
        return maxPriorityFeePerGas <= MAX_PRIORITY_FEE;
    }

    function _validGasLimits(
        PackedUserOperation calldata userOp,
        uint256 computedDataLength
    ) private view returns (bool) {
        // Base calculations of gas limits on calldata size, this is a simple workaround for now
        //      -> an alernative for verificationGas could be to do internal gas metering
        // Employ a maximum gas limit based on locked tokens
        if (
            userOp.preVerificationGas >
            computedDataLength *
                PRE_VERIFICATION_GAS_PER_BYTE +
                PRE_VERIFICATION_BASE_GAS
        ) return false;
        uint256 verificationGasLimit = userOp.unpackVerificationGasLimit();
        if (
            verificationGasLimit >
            computedDataLength * VERIFICATION_GAS_PER_BYTE
        ) return false;
        uint256 callGasLimit = userOp.unpackCallGasLimit();
        if (callGasLimit > computedDataLength * CALL_GAS_PER_BYTE) return false;
        return true;
    }

    function _verifySafeTxData(
        bytes calldata callData
    ) private pure returns (bytes32, address, bytes32, bytes32, uint256) {
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
        return (safeTxHash, signer, r, vs, data.length + 18 * 32 + 4);
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
        ) = CoreLib.recoverSigner(safeTxHash, signature);
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
