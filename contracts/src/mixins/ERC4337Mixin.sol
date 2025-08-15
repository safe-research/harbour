// SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.29;

import {
    IAccount,
    PackedUserOperation
} from "@account-abstraction/contracts/interfaces/IAccount.sol";
import {
    IAccountExecute
} from "@account-abstraction/contracts/interfaces/IAccountExecute.sol";
import {
    IEntryPoint
} from "@account-abstraction/contracts/interfaces/IEntryPoint.sol";
import {
    _packValidationData
} from "@account-abstraction/contracts/core/Helpers.sol";
import {
    InvalidEntryPoint,
    InvalidTarget,
    InvalidUserOpPaymaster,
    UnexpectedNonce
} from "../interfaces/Errors.sol";
import {PaymasterLib} from "../libs/PaymasterLib.sol";

abstract contract ERC4337Mixin is IAccount, IAccountExecute {
    using PaymasterLib for PackedUserOperation;

    // ------------------------------------------------------------------
    // Data structures
    // ------------------------------------------------------------------

    struct Config {
        address entryPoint;
    }

    // ------------------------------------------------------------------
    // 4337 functions
    // ------------------------------------------------------------------

    /**
     * @notice The address of the EntryPoint contract supported by this mixin.
     */
    address public immutable SUPPORTED_ENTRY_POINT;

    constructor(Config memory config) {
        SUPPORTED_ENTRY_POINT = config.entryPoint;
    }

    /**
     * @notice Modifier that checks that a function is only callable by the supported entry point.
     */
    modifier onlySupportedEntryPoint() {
        require(
            msg.sender == SUPPORTED_ENTRY_POINT,
            InvalidEntryPoint(msg.sender)
        );
        _;
    }

    /**
     * @notice Return the nonce for a specific signer.
     * @param signer Address of the signer of the Safe transaction.
     * @return Nonce for the signer
     */
    function getNonce(address signer) public view virtual returns (uint256) {
        return
            IEntryPoint(SUPPORTED_ENTRY_POINT).getNonce(
                address(this),
                uint192(uint160(signer))
            );
    }

    /**
     * @inheritdoc IAccount
     */
    function validateUserOp(
        PackedUserOperation calldata userOp,
        bytes32,
        uint256
    )
        external
        view
        override
        onlySupportedEntryPoint
        returns (uint256 validationData)
    {
        bytes4 selector = bytes4(userOp.callData);
        require(
            selector == this.executeUserOp.selector,
            InvalidTarget(selector)
        );

        // Harbour can only be used with a paymaster when using 4337
        require(userOp.paymasterAndData.length > 0, InvalidUserOpPaymaster());

        address signer = _validateRelayedData(userOp.callData[4:]);
        uint192 nonceKey = uint192(uint160(signer));
        require(
            uint192(userOp.nonce >> 64) == nonceKey,
            UnexpectedNonce(nonceKey)
        );

        // We skip the check that `missingAccountFunds` should be == 0, as this is enforced by the
        // entry point when a paymaster is used.

        return _packValidationData(false, 0, 0);
    }

    /**
     * @inheritdoc IAccountExecute
     */
    function executeUserOp(
        PackedUserOperation calldata userOp,
        bytes32
    ) external override onlySupportedEntryPoint {
        address relayer = userOp.extractPaymaster();
        _storeRelayedData(relayer, userOp.callData[4:]);
    }

    // ------------------------------------------------------------------
    // Internal relaying implementation functions
    // ------------------------------------------------------------------

    /**
     * @dev Internal function to check relayed data is valid. Contrary to standard ERC-4337 account
     *      implementations, this function is expected to revert if the relayed data is invalid.
     *
     * @param data    The relayed data to validate.
     *
     * @return signer The signer for which the data was validated.
     */
    function _validateRelayedData(
        bytes calldata data
    ) internal view virtual returns (address signer);

    /**
     * @dev Internal function to store the relayed data. This will **only** be called for `data`
     *      where `_validateData(data)` returned true in the same relayed transaction.
     *
     * @param relayer The relayer for the data.
     * @param data    The relayed data to store.
     */
    function _storeRelayedData(
        address relayer,
        bytes calldata data
    ) internal virtual;
}
