// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.29;

// ------------------------------------------------------------------
// Errors
// ------------------------------------------------------------------

/**
 * @notice Thrown when a signature blob is not exactly 65 bytes.
 */
error InvalidECDSASignatureLength();

/**
 * @notice Thrown if `ecrecover` yields `address(0)`.
 */
error InvalidSignature();

/**
 * @notice Thrown if the S value of the signature is not from the lower half of the curve.
 */
error InvalidSignatureSValue();

/**
 * @notice Thrown when a value doesn't fit in a uint128.
 */
error ValueDoesNotFitInUint128();

/**
 * @notice Thrown when attempting to store a signature for a transaction (safeTxHash)
 * that the signer has already provided a signature for.
 * @param signer Signer address.
 * @param safeTxHash The EIP-712 hash of the Safe transaction.
 */
error SignerAlreadySignedTransaction(address signer, bytes32 safeTxHash);
error InvalidTarget(bytes4 targetSelector);
error InvalidEntryPoint(address entryPoint);
error InvalidUserOpPaymaster();
error InvalidValidatorData();
error UnexpectedUserSignature();
error UnexpectedSafeTxHash(bytes32 expectedSafeTxHash);
error UnexpectedSigner(address recoveredSigner);
error UnexpectedSignatureR(bytes32 extractedR);
error UnexpectedSignatureVS(bytes32 extractedVS);
error UnexpectedNonce(uint192 expectedKey);

/**
 * @notice Thrown when attempting to enqueue nothing. That is, when calling `enqueueTransaction` on
 *         the {SafeSecretHarbour} with empty `signature` and `encryptionBlob`.
 */
error NothingToEnqueue();

// ------------------------------------------------------------------
// Quota Errors
// ------------------------------------------------------------------

error WithdrawalAlreadyPerformed(bytes32 withdrawalHash);
error InsufficientTokensForWithdrawal();
error TokensInUse();
error QuotaOverflow(uint256 maxSignerQuota);

// ------------------------------------------------------------------
// Slashing Errors
// ------------------------------------------------------------------

error ConditionAlreadyEnabled();
error ConditionAlreadyDisabled();
error ConditionNotEnabled();
error ConditionWasNotActive();
error ConditionNotOffended();
error UserOpAlreadySlashed();
error NothingToSlash();
error InvalidBeneficiary();
