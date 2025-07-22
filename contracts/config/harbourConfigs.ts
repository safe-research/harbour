import type { ERC4337MixinConfigStruct, QuotaMixinConfigStruct } from "../typechain-types/src/SafeInternationalHarbour";

export type HarbourConfig = {
	erc4337config?: Partial<ERC4337MixinConfigStruct>;
	quotaConfig?: Partial<QuotaMixinConfigStruct>;
};

export const harbourConfigs: Record<string, HarbourConfig> = {
	"100": {
		erc4337config: {
			entryPoint: "0x4337084d9e255ff0702461cf8895ce9e3b5ff108",
		},
		quotaConfig: {
			// Safe Token bridged to Gnosis Chain
			feeToken: "0x4d18815D14fe5c3304e87B3FA18318baa5c23820",
			quotaPerFeeToken: 1000000,
			quotaPerFeeTokenScale: 18,
		},
	},
	"11155111": {
		erc4337config: {
			entryPoint: "0x4337084d9e255ff0702461cf8895ce9e3b5ff108",
		},
		quotaConfig: {
			// WETH used by CoW on Sepolia
			feeToken: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
			quotaPerFeeToken: 1000000,
			quotaPerFeeTokenScale: 18,
		},
	},
};

export default {};
