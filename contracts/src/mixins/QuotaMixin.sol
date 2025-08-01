// // SPDX-License-Identifier: GPL-3.0-only
pragma solidity ^0.8.29;

import {
    SafeERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IQuotaManager} from "../interfaces/QuotaManager.sol";
import {CoreLib} from "../libs/CoreLib.sol";
import {
    WithdrawalAlreadyPerformed,
    InsufficientTokensForWithdrawal,
    TokensInUse,
    QuotaOverflow
} from "../interfaces/Errors.sol";

struct QuotaStats {
    uint96 tokenBalance; // uint96 might also be enough, as this would be more tokens than most project have in circulation
    uint96 usedQuota; // Quota is limited to 96 bits (current Quota == Bytes of data or eth costs for a tx, so that should be ok)
    uint48 nextQuotaReset; // timestamps are Safe to limit to 64 bits
}

struct QuotaMixinConfig {
    uint32 timeframeQuotaReset;
    uint16 requiredQuotaMultiplier;
    uint96 maxAvailableQuota;
    address feeToken;
    uint32 quotaPerFeeToken;
    uint8 quotaPerFeeTokenScale;
}

abstract contract QuotaMixin is IQuotaManager {
    using SafeERC20 for IERC20;

    event Withdraw(address indexed signer, uint256 indexed amount);
    event Deposit(address indexed signer, uint256 indexed amount);

    mapping(address => QuotaStats) public quotaStatsForSigner;
    mapping(address => mapping(bytes32 => uint256)) public withdrawsForSigner;

    bool public immutable QUOTA_ENABLED;
    uint32 public immutable TIMEFRAME_QUOTA_RESET;
    uint96 public immutable MAX_AVAILABLE_QUOTA;
    address public immutable FEE_TOKEN;
    uint32 public immutable QUOTA_PER_FEE_TOKEN;
    uint8 public immutable QUOTA_PER_FEE_TOKEN_SCALE;

    constructor(QuotaMixinConfig memory _config) {
        QUOTA_ENABLED = _config.feeToken != address(0);
        TIMEFRAME_QUOTA_RESET = _config.timeframeQuotaReset;
        MAX_AVAILABLE_QUOTA = _config.maxAvailableQuota;
        FEE_TOKEN = _config.feeToken;
        QUOTA_PER_FEE_TOKEN = _config.quotaPerFeeToken;
        QUOTA_PER_FEE_TOKEN_SCALE = _config.quotaPerFeeTokenScale;
    }

    function depositTokensForSigner(address signer, uint96 amount) public {
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
        uint96 amount,
        address beneficiary,
        uint256 nonce
    ) public payable {
        bytes32 withdrawHash = computeWithdrawHash(amount, beneficiary, nonce);
        (address signer, , ) = CoreLib.recoverSigner(withdrawHash, signature);
        // Check that withdrawal was not executed yet
        require(
            withdrawsForSigner[signer][withdrawHash] == 0,
            WithdrawalAlreadyPerformed(withdrawHash)
        );
        withdrawsForSigner[signer][withdrawHash] = block.timestamp;

        _withdrawSignerTokens(signer, beneficiary, amount, false);

        emit Withdraw(signer, amount);
    }

    function _withdrawSignerTokens(
        address signer,
        address beneficiary,
        uint96 amount,
        bool skipResetCheck
    ) internal override {
        QuotaStats storage stats = quotaStatsForSigner[signer];
        require(
            stats.tokenBalance >= amount,
            InsufficientTokensForWithdrawal()
        );
        // We use the quota reset timeframe as a unlock timeframe
        // -> currently the signer is not allowed to sign any Safe transaction during this timeframe
        // TODO: have dedicated unlock logic (also to avoid some fee exploit flows)
        require(
            skipResetCheck || stats.nextQuotaReset < block.timestamp,
            TokensInUse()
        );

        stats.tokenBalance -= amount;

        if (beneficiary != address(this)) {
            _transferFeeToken(beneficiary, amount);
        }
    }

    function _transferFeeToken(
        address beneficiary,
        uint96 amount
    ) internal override {
        IERC20(FEE_TOKEN).safeTransfer(beneficiary, amount);
    }

    function availableFreeQuotaForSigner(
        address signer
    )
        public
        view
        returns (
            uint96 availableFreeQuota,
            uint96 usedSignerQuota,
            uint48 nextSignerQuotaReset
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
            uint48 blocktime = uint48(block.timestamp);
            nextSignerQuotaReset =
                blocktime -
                ((blocktime - nextSignerQuotaReset) % TIMEFRAME_QUOTA_RESET) +
                TIMEFRAME_QUOTA_RESET;
        }
        // We cast tokenBalance to uint256 to use more bits for the arithmetics
        uint256 maxSignerQuota = (uint256(stats.tokenBalance) *
            QUOTA_PER_FEE_TOKEN) / 10 ** QUOTA_PER_FEE_TOKEN_SCALE;

        require(
            maxSignerQuota <= type(uint96).max,
            QuotaOverflow(maxSignerQuota)
        );

        uint96 freeSignerQuota = uint96(maxSignerQuota);
        // If MAX_AVAILABLE_QUOTA is set to 0 then there is no limit
        if (MAX_AVAILABLE_QUOTA > 0 && freeSignerQuota > MAX_AVAILABLE_QUOTA) {
            freeSignerQuota = MAX_AVAILABLE_QUOTA;
        }
        if (usedSignerQuota <= freeSignerQuota) {
            availableFreeQuota = freeSignerQuota - usedSignerQuota;
        } else {
            availableFreeQuota = 0;
        }
    }

    function _updateQuotaParams(
        address signer,
        uint96 newSignerQuota,
        uint48 nextSignerQuotaReset
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
        if (!QUOTA_ENABLED || requiredSignerQuota == 0) return true;
        (
            uint96 availableFreeSignerQuota,
            uint96 usedSignerQuota,
            uint48 nextSignerQuotaReset
        ) = availableFreeQuotaForSigner(signer);
        if (requiredSignerQuota > availableFreeSignerQuota) return false;
        // Casting to uint64 is safe, as availableFreeSignerQuota is at most a uint64 and we compare it against that
        _updateQuotaParams(
            signer,
            usedSignerQuota + uint96(requiredSignerQuota),
            nextSignerQuotaReset
        );
        return true;
    }
}
