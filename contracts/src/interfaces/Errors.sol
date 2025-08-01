// // SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.29;

// ------------------------------------------------------------------
// Errors
// ------------------------------------------------------------------

/// Thrown when a signature blob is not exactly 65 bytes.
error InvalidECDSASignatureLength();

/// Thrown if `ecrecover` yields `address(0)`.
error InvalidSignature();

/// Thrown if the S value of the signature is not from the lower half of the curve.
error InvalidSignatureSValue();

/// Thrown when a value doesn't fit in a uint128.
error ValueDoesNotFitInUint128();

/// @notice Thrown when attempting to store a signature for a transaction (safeTxHash)
/// that the signer has already provided a signature for.
/// @param signer Signer address.
/// @param safeTxHash The EIP-712 hash of the Safe transaction.
error SignerAlreadySignedTransaction(address signer, bytes32 safeTxHash);
error InvalidTarget(bytes4 targetSelector);
error InvalidEntryPoint(address entryPoint);
error InvalidUserOpPaymaster();
error UnexpectedUserSignature();
error UnexpectedSafeTxHash(bytes32 expectedSafeTxHash);
error UnexpectedSigner(address recoveredSigner);
error UnexpectedSignatureR(bytes32 extractedR);
error UnexpectedSignatureVS(bytes32 extractedVS);
error UnexpectedNonce(address expectedKey);
