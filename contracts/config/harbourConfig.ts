import type { ERC4337Mixin, QuotaMixin } from "../typechain-types/src/SafeInternationalHarbour";

export type HarbourConfig = {
	erc4337config?: Partial<ERC4337Mixin.ERC4337MixinConfigStruct>;
	quotaConfig?: Partial<QuotaMixin.QuotaMixinConfigStruct>;
};

export const harbourConfig: Record<string, HarbourConfig> = {
	"100": {
		erc4337config: {
			entryPoint: "0x4337084d9e255ff0702461cf8895ce9e3b5ff108",
		},
		quotaConfig: {
			// Safe Token bridged to Gnosis Chain
			feeToken: "0x4d18815D14fe5c3304e87B3FA18318baa5c23820",
			feeTokenDecimals: 18,
			quotaPerDepositedFeeToken: 1000000,
		},
	},
	"11155111": {
		erc4337config: {
			entryPoint: "0x4337084d9e255ff0702461cf8895ce9e3b5ff108",
		},
		quotaConfig: {
			// WETH used by CoW on Sepolia
			feeToken: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
			feeTokenDecimals: 18,
			quotaPerDepositedFeeToken: 1000000,
		},
	},
};

export default {};
