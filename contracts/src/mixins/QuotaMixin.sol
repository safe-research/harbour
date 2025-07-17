// // SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.29;

import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IQuotaManager} from "../interfaces/QuotaManager.sol";
import {CoreLib} from "../libs/CoreLib.sol";

struct QuotaStats {
    uint128 tokenBalance; // uint96 might also be enough, as this would be more tokens than most project have in circulation
    uint64 usedQuota; // Quota is limited to 64 bits (current Quota == Bytes of data, so that should be ok)
    uint64 nextQuotaReset; // timestamps are Safe to limit to 64 bits
}

struct QuotaMixinConfig {
    uint64 timeframeQuotaReset;
    uint16 requiredQuotaMultiplier;
    uint32 quotaPerDepositedFeeToken;
    uint32 maxFreeQuota;
    address feeToken;
    uint8 feeTokenDecimals;
}

abstract contract QuotaMixin is IQuotaManager {
    using SafeERC20 for IERC20;

    event Withdraw(address indexed signer, uint256 indexed amount);
    event Deposit(address indexed signer, uint256 indexed amount);

    mapping(address => QuotaStats) public quotaStatsForSigner;
    mapping(address => mapping(bytes32 => uint256)) public withdrawsForSigner;

    uint64 public immutable TIMEFRAME_QUOTA_RESET;
    uint32 public immutable QUOTA_PER_DEPOSITED_FEE_TOKEN;
    uint16 public immutable REQUIRED_QUOTA_MULTIPLIER;
    uint32 public immutable MAX_FREE_QUOTA;
    address public immutable FEE_TOKEN;
    uint8 public immutable FEE_TOKEN_DECIMALS;

    constructor(QuotaMixinConfig memory _config) {
        TIMEFRAME_QUOTA_RESET = _config.timeframeQuotaReset;
        QUOTA_PER_DEPOSITED_FEE_TOKEN = _config.quotaPerDepositedFeeToken;
        REQUIRED_QUOTA_MULTIPLIER = _config.requiredQuotaMultiplier;
        MAX_FREE_QUOTA = _config.maxFreeQuota;
        FEE_TOKEN = _config.feeToken;
        FEE_TOKEN_DECIMALS = _config.feeTokenDecimals;
    }

    function depositTokensForSigner(address signer, uint128 amount) public {
        // We don't update the nextQuotaReset this way depositing more tokens does not negatively affect the reset schedule
        // The reset schedule always starts from 0, therefore is always a multiple of the reset timeframe (unless the timeframe is changed)
        quotaStatsForSigner[signer].tokenBalance += amount;
        // TODO: check if we want to track total tokens locked (might be useful in a recovery case)
        IERC20(FEE_TOKEN).safeTransferFrom(msg.sender, address(this), amount);
        emit Deposit(signer, amount);
    }

    function computeWithdrawHash(
        uint256 amount,
        address beneficiary,
        uint256 nonce
    ) internal view returns (bytes32 withdrawHash) {
        bytes32 domainSeparator = keccak256(
            abi.encode(
                keccak256(
                    "EIP712Domain(uint256 chainId,address verifyingContract)"
                ),
                block.chainid,
                address(this)
            )
        );
        bytes32 structHash = keccak256(
            abi.encode(
                keccak256(
                    "WithdrawRequest(uint256 amount,address beneficiary,uint256 nonce)"
                ),
                amount,
                beneficiary,
                nonce
            )
        );
        withdrawHash = keccak256(
            abi.encodePacked("\x19\x01", domainSeparator, structHash)
        );
    }

    function widthdrawTokensForSigner(
        bytes calldata signature,
        uint128 amount,
        address beneficiary,
        uint256 nonce
    ) public payable {
        bytes32 withdrawHash = computeWithdrawHash(amount, beneficiary, nonce);
        (address signer, , ) = CoreLib.recoverSigner(withdrawHash, signature);
        // Check that withdrawal was not executed yet
        require(
            withdrawsForSigner[signer][withdrawHash] == 0,
            "Withdrawal was already performed"
        );
        withdrawsForSigner[signer][withdrawHash] = block.timestamp;

        _withdrawSignerTokens(signer, beneficiary, amount, false);

        emit Withdraw(signer, amount);
    }

    function _withdrawSignerTokens(
        address signer,
        address beneficiary,
        uint128 amount,
        bool skipResetCheck
    ) internal override {
        QuotaStats storage stats = quotaStatsForSigner[signer];
        require(stats.tokenBalance >= amount, "Insufficient Tokens");
        // We use the quota reset timeframe as a unlock timeframe
        // -> currently the signer is not allowed to sign any Safe transaction during this timeframe
        // TODO: have dedicated unlock logic (also to avoid some fee exploit flows)
        require(
            skipResetCheck || stats.nextQuotaReset < block.timestamp,
            "Tokens have been used during this timeframe"
        );

        stats.tokenBalance -= amount;

        if (beneficiary != address(this))
            _transferFeeToken(beneficiary, amount);
    }

    function _transferFeeToken(
        address beneficiary,
        uint128 amount
    ) internal override {
        IERC20(FEE_TOKEN).safeTransfer(beneficiary, amount);
    }

    function availableFreeQuotaForSigner(
        address signer
    )
        public
        view
        returns (
            uint64 availableFreeQuota,
            uint64 usedSignerQuota,
            uint64 nextSignerQuotaReset
        )
    {
        QuotaStats memory stats = quotaStatsForSigner[signer];
        nextSignerQuotaReset = stats.nextQuotaReset;
        if (nextSignerQuotaReset > block.timestamp) {
            usedSignerQuota = stats.usedQuota;
        } else {
            // Signer quota should be reset (therefore be 0)
            usedSignerQuota = 0;
            // The reset time should always be aligned with the timeframe (be a multiple)
            // First the time difference since the last reset is calculated (last reset - block time)
            // Then the elablesed time in the current timeframe (modulo with timeframe duration)
            // Then substract this from the current blocktime to get the start of the current timeframe
            // And lastly add the timeframe duration to get the starting point of the next timeframe
            uint64 blocktime = uint64(block.timestamp);
            nextSignerQuotaReset =
                blocktime -
                ((blocktime - nextSignerQuotaReset) % TIMEFRAME_QUOTA_RESET) +
                TIMEFRAME_QUOTA_RESET;
        }
        // We cast tokenBalance to uint256 to use more bits for the arithmetics
        uint256 maxSignerQuota = (uint256(stats.tokenBalance) *
            QUOTA_PER_DEPOSITED_FEE_TOKEN) / 10 ** FEE_TOKEN_DECIMALS;

        require(
            maxSignerQuota <= type(uint64).max,
            "Max signer quota too high"
        );

        uint64 freeSignerQuota = uint64(maxSignerQuota);
        if (freeSignerQuota > MAX_FREE_QUOTA) {
            freeSignerQuota = MAX_FREE_QUOTA;
        }
        if (usedSignerQuota <= freeSignerQuota) {
            availableFreeQuota = freeSignerQuota - usedSignerQuota;
        } else {
            availableFreeQuota = 0;
        }
    }

    function _updateQuotaParams(
        address signer,
        uint64 newSignerQuota,
        uint64 nextSignerQuotaReset
    ) internal {
        QuotaStats storage stats = quotaStatsForSigner[signer];
        if (nextSignerQuotaReset != stats.nextQuotaReset) {
            stats.nextQuotaReset = nextSignerQuotaReset;
        }
        stats.usedQuota = newSignerQuota;
    }

    function _checkAndUpdateQuota(
        address signer,
        uint256 requiredSignerQuota
    ) internal override returns (bool) {
        if (REQUIRED_QUOTA_MULTIPLIER == 0) return true;
        (
            uint64 availableFreeSignerQuota,
            uint64 usedSignerQuota,
            uint64 nextSignerQuotaReset
        ) = availableFreeQuotaForSigner(signer);
        uint256 adjustedRequiredSignerQuota = REQUIRED_QUOTA_MULTIPLIER *
            requiredSignerQuota;
        if (adjustedRequiredSignerQuota > availableFreeSignerQuota)
            return false;
        // Casting to uint64 is safe, as availableFreeSignerQuota is at most a uint64 and we compare it against that
        _updateQuotaParams(
            signer,
            usedSignerQuota + uint64(adjustedRequiredSignerQuota),
            nextSignerQuotaReset
        );
        return true;
    }
}
