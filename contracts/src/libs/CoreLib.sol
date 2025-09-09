// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.29;

import {
    ENCRYPTION_KEY_REGISTRATION_TYPEHASH,
    HARBOUR_DOMAIN_TYPEHASH,
    SAFE_DOMAIN_TYPEHASH,
    SAFE_TX_TYPEHASH,
    SECP256K1_LOW_S_BOUND
} from "../interfaces/Constants.sol";
import {
    InvalidECDSASignatureLength,
    InvalidSignatureSValue,
    InvalidSignature,
    ValueDoesNotFitInUint128
} from "../interfaces/Errors.sol";

library CoreLib {
    // ------------------------------------------------------------------
    // Internal functions
    // ------------------------------------------------------------------

    /**
     * @notice Computes the EIP-712 hash for a given domain and message.
     *
     * @param domainSeparator   The EIP-712 domain separator hash.
     * @param messageStructHash The EIP-712 struct hash of the message.
     *
     * @return digest           The EIP-712 digest.
     */
    function computeErc712Hash(
        bytes32 domainSeparator,
        bytes32 messageStructHash
    ) internal pure returns (bytes32 digest) {
        digest = keccak256(
            abi.encodePacked("\x19\x01", domainSeparator, messageStructHash)
        );
    }

    /**
     * @notice Computes the EIP-712 domain separator for a Safe.
     *
     * @param chainId          The chain ID of the Safe Smart Account.
     * @param safe             The address of the Safe Smart Account.
     *
     * @return domainSeparator The EIP-712 domain separator hash.
     */
    function safeDomainSeparator(
        uint256 chainId,
        address safe
    ) internal pure returns (bytes32 domainSeparator) {
        domainSeparator = keccak256(
            abi.encode(SAFE_DOMAIN_TYPEHASH, chainId, safe)
        );
    }

    /**
     * @notice Computes the unique EIP-712 digest for a SafeTx using the provided parameters and domain.
     *
     * @param safeAddress    Address of the target Safe Smart Account.
     * @param chainId        Chain ID included in the domain separator.
     * @param nonce          Safe transaction nonce.
     * @param to             Target address the Safe will call.
     * @param value          ETH value to be sent with the call.
     * @param data           Call data executed by the Safe.
     * @param operation      Operation type: 0 = CALL, 1 = DELEGATECALL.
     * @param safeTxGas      Gas limit for the Safe's internal execution.
     * @param baseGas        Base gas overhead for reimbursement.
     * @param gasPrice       Gas price used for reimbursement calculation.
     * @param gasToken       Token address for refunds (0x0 for ETH).
     * @param refundReceiver Address to receive gas refunds.
     *
     * @return safeTxHash    Keccak256 digest of the EIP-712 encoded SafeTx.
     */
    function computeSafeTxHash(
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
        bytes32 domainSeparator = safeDomainSeparator(chainId, safeAddress);
        bytes32 safeTxStructHash = keccak256(
            abi.encode(
                SAFE_TX_TYPEHASH,
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
        safeTxHash = computeErc712Hash(domainSeparator, safeTxStructHash);
    }

    /**
     * @notice Computes a Safe transaction hash from partial data.
     *
     * @param chainId          Chain ID included in the domain separator.
     * @param safeAddress      Address of the target Safe Smart Account.
     * @param safeTxStructHash The EIP-712 struct hash of the Safe transaction data.
     *
     * @return safeTxHash      Keccak256 digest of the EIP-712 encoded SafeTx.
     */
    function computePartialSafeTxHash(
        uint256 chainId,
        address safeAddress,
        bytes32 safeTxStructHash
    ) internal pure returns (bytes32 safeTxHash) {
        bytes32 domainSeparator = safeDomainSeparator(chainId, safeAddress);
        safeTxHash = computeErc712Hash(domainSeparator, safeTxStructHash);
    }

    /**
     * @notice Computes the EIP-712 domain separator for Harbour.
     *
     * @param harbour          The address of the Harbour contract.
     *
     * @return domainSeparator The EIP-712 domain separator hash.
     */
    function harbourDomainSeparator(
        address harbour
    ) internal pure returns (bytes32 domainSeparator) {
        // NOTE: The Harbour domain separator does _NOT_ use the chain ID as
        // part of the domain. Why? Harbour contains cross-chain data, so
        // approvals for harbour actions (like registering an encryption key)
        // aren't tied to a specific chain.
        domainSeparator = keccak256(
            abi.encode(HARBOUR_DOMAIN_TYPEHASH, harbour)
        );
    }

    /**
     * @notice Computes the encryption key registration hash for authentication.
     *
     * @dev Note that Harbour encryption key registration hashes include the harbour chain ID in
     *      the message and not in the signing domain. This is because the encryption key is used
     *      for Safe transactions on **all** chains, and not just on the chain Harbour chain where
     *      it is stored. Essentially, `harbourChainId` represents the chain where the encryption
     *      key is _stored_ and not where it is _used_.
     *
     * @param harbour           The address of the Harbour contract.
     * @param context           A 32-byte context specific to the public encryption key.
     * @param publicKey         The public encryption key.
     * @param harbourChainId    The Harbour chain where the encryption key will be stored.
     * @param nonce             The encryption key registration nonce.
     * @param deadline          Deadline for the registration.
     *
     * @return registrationHash The EIP-712 encoded encryption key registration hash.
     */
    function computeEncryptionKeyRegistrationHash(
        address harbour,
        bytes32 context,
        bytes32 publicKey,
        uint256 harbourChainId,
        uint256 nonce,
        uint256 deadline
    ) internal pure returns (bytes32 registrationHash) {
        bytes32 domainSeparator = harbourDomainSeparator(harbour);
        bytes32 registrationStructHash = keccak256(
            abi.encode(
                ENCRYPTION_KEY_REGISTRATION_TYPEHASH,
                context,
                publicKey,
                harbourChainId,
                nonce,
                deadline
            )
        );
        registrationHash = computeErc712Hash(
            domainSeparator,
            registrationStructHash
        );
    }

    /**
     * @notice Splits a 65-byte ECDSA signature into its components and recovers the signer address.
     *
     * @dev Supports both EIP-712 and eth_sign flows by detecting v > 30 and applying the Ethereum Signed Message prefix.
     *
     * @param digest  The message or data hash to verify (ERC-712 digest or eth_sign prefixed).
     * @param sig     Concatenated 65-byte ECDSA signature (r || s || v).
     *
     * @return signer The address that produced the signature (EOA).
     * @return r      First 32 bytes of the ECDSA signature.
     * @return vs     Compact representation of s and v coming from EIP-2098.
     */
    function recoverSigner(
        bytes32 digest,
        bytes calldata sig
    ) internal pure returns (address signer, bytes32 r, bytes32 vs) {
        require(sig.length == 65, InvalidECDSASignatureLength());
        uint256 v;
        bytes32 s;
        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 0x20))
            v := byte(0, calldataload(add(sig.offset, 0x40)))
        }
        require(s <= SECP256K1_LOW_S_BOUND, InvalidSignatureSValue());

        signer = ecrecover(digest, uint8(v), r, s);
        require(signer != address(0), InvalidSignature());
        unchecked {
            vs = bytes32((uint256(v - 27) << 255) | uint256(s));
        }
    }

    /**
     * @notice Recovers the signer address from an EIP-2098 compact signature.
     *
     * @param digest  The message or data hash to verify (ERC-712 digest or eth_sign prefixed).
     * @param r       First 32 bytes of the ECDSA signature.
     * @param vs      Compact representation of s and v coming from EIP-2098.
     *
     * @return signer The address that produced the signature (EOA).
     */
    function recoverSigner(
        bytes32 digest,
        bytes32 r,
        bytes32 vs
    ) internal pure returns (address signer) {
        (bytes32 s, uint8 v) = splitVS(vs);
        require(s <= SECP256K1_LOW_S_BOUND, InvalidSignatureSValue());

        signer = ecrecover(digest, v, r, s);
        require(signer != address(0), InvalidSignature());
    }

    function splitVS(bytes32 vs) internal pure returns (bytes32 s, uint8 v) {
        // solhint-disable-next-line no-inline-assembly
        assembly ("memory-safe") {
            // Equivalent to:
            // s = bytes32(uint256(vs) & (uint256(1 << 255) - 1))
            // v = uint8(uint256(vs >> 255) + 27)
            // Assembly is slighly more gas efficient here
            s := and(sub(shl(255, 1), 1), vs)
            v := add(shr(255, vs), 27)
        }
    }

    function safeCastUint256ToUint128(
        uint256 value
    ) internal pure returns (uint128) {
        require(value <= type(uint128).max, ValueDoesNotFitInUint128());
        return uint128(value);
    }
}
