// // SPDX-License-Identifier: GPL-3.0-only
/* solhint-disable no-unused-import */
pragma solidity ^0.8.29;

import {QuotaMixin, QuotaMixinConfig} from "../mixins/QuotaMixin.sol";

contract TestQuotaManager is QuotaMixin {
    error TestOverQuota();

    constructor(
        QuotaMixinConfig memory _quotaMixinconfig
    ) QuotaMixin(_quotaMixinconfig) {}

    function checkAndUpdateQuota(
        address signer,
        uint256 requiredSignerQuota
    ) public {
        require(
            _checkAndUpdateQuota(signer, requiredSignerQuota),
            TestOverQuota()
        );
    }
}
