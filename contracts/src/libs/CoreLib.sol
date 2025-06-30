// SPDX-License-Identifier: GNU GPLv3
pragma solidity ^0.8.29;

import "../interfaces/Constants.sol";
import "../interfaces/Types.sol";
import "../interfaces/Errors.sol";
import "../interfaces/Events.sol";

library CoreLib {
    // ------------------------------------------------------------------
    // Internal functions
    // ------------------------------------------------------------------

    /**
     * @notice Computes the unique EIP-712 digest for a SafeTx using the provided parameters and domain.
     * @param safeAddress Address of the target Safe Smart Account.
     * @param chainId Chain ID included in the domain separator.
     * @param nonce Safe transaction nonce.
     * @param to Target address the Safe will call.
     * @param value ETH value to be sent with the call.
     * @param data Call data executed by the Safe.
     * @param operation Operation type: 0 = CALL, 1 = DELEGATECALL.
     * @param safeTxGas Gas limit for the Safe's internal execution.
     * @param baseGas Base gas overhead for reimbursement.
     * @param gasPrice Gas price used for reimbursement calculation.
     * @param gasToken Token address for refunds (0x0 for ETH).
     * @param refundReceiver Address to receive gas refunds.
     * @return safeTxHash Keccak256 digest of the EIP-712 encoded SafeTx.
     */
    function _computeSafeTxHash(
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
        address refundReceiver
    ) internal pure returns (bytes32 safeTxHash) {
        bytes32 domainSeparator = keccak256(
            abi.encode(_DOMAIN_TYPEHASH, chainId, safeAddress)
        );
        bytes32 structHash = keccak256(
            abi.encode(
                _SAFE_TX_TYPEHASH,
                to,
                value,
                keccak256(data),
                operation,
                safeTxGas,
                baseGas,
                gasPrice,
                gasToken,
                refundReceiver,
                nonce
            )
        );
        safeTxHash = keccak256(
            abi.encodePacked("\x19\x01", domainSeparator, structHash)
        );
    }

    /**
     * @notice Splits a 65-byte ECDSA signature into its components and recovers the signer address.
     * @param digest The message or data hash to verify (EIP-712 digest or eth_sign prefixed).
     * @param sig Concatenated 65-byte ECDSA signature (r || s || v).
     * @return signer The address that produced the signature (EOA).
     * @return r First 32 bytes of the ECDSA signature.
     * @return vs Compact representation of s and v coming from EIP-2098.
     * @dev Supports both EIP-712 and eth_sign flows by detecting v > 30 and applying the Ethereum Signed Message prefix.
     */
    function _recoverSigner(
        bytes32 digest,
        bytes calldata sig
    ) internal pure returns (address signer, bytes32 r, bytes32 vs) {
        uint8 v;
        bytes32 s;
        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 0x20))
            v := byte(0, calldataload(add(sig.offset, 0x40)))
        }
        require(s <= SECP256K1_LOW_S_BOUND, InvalidSignatureSValue());

        signer = ecrecover(digest, v, r, s);
        require(signer != address(0), InvalidSignature());
        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            // Equivalent to:
            // vs = bytes32(uint256(v - 27)  << 255 | uint256(s));
            // Which should avoid conversion between uint256 and bytes32
            vs := or(shl(255, sub(v, 27)), s)
        }
    }

    function _safeCastUint256ToUint128(
        uint256 value
    ) internal pure returns (uint128) {
        require(value <= type(uint128).max, ValueDoesNotFitInUint128());
        return uint128(value);
    }
}
