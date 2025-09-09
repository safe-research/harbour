// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.29;

// ------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------

// The hashes must be the same as the ones in the Safe contract:
// https://github.com/safe-global/safe-smart-account/blob/b115c4c5fe23dca6aefeeccc73d312ddd23322c2/contracts/Safe.sol#L54-L63
// These should cover Safe versions 1.3.0 and 1.4.1
// keccak256("EIP712Domain(uint256 chainId,address verifyingContract)")
bytes32 constant SAFE_DOMAIN_TYPEHASH = 0x47e79534a245952e8b16893a336b85a3d9ea9fa8c573f3d803afb92a79469218;

// keccak256("SafeTx(address to,uint256 value,bytes data,uint8 operation,uint256 safeTxGas,uint256 baseGas,uint256 gasPrice,address gasToken,address refundReceiver,uint256 nonce)")
bytes32 constant SAFE_TX_TYPEHASH = 0xbb8310d486368db6bd6f849402fdd73ad53d316b5a4b2644ad6efe0f941286d8;

// keccak256("EIP712Domain(address verifyingContract)")
bytes32 constant HARBOUR_DOMAIN_TYPEHASH = 0x035aff83d86937d35b32e04f0ddc6ff469290eef2f1b692d8a815c89404d4749;

// keccak256("EncryptionKeyRegistration(bytes32 context,bytes32 publicKey,uint256 harbourChainId,uint256 nonce,uint256 deadline)")
bytes32 constant ENCRYPTION_KEY_REGISTRATION_TYPEHASH = 0x5577dd2e8f3cae24f69b98e4cdf50cb186492fb1ca342a9a6cf161733ca273b2;

// The lower bound of the S value for a valid secp256k1 signature.
// https://github.com/safe-global/safe-smart-account/blob/b115c4c5fe23dca6aefeeccc73d312ddd23322c2/contracts/Safe.sol#L100
bytes32 constant SECP256K1_LOW_S_BOUND = 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0;
