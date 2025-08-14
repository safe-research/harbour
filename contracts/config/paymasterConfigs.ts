import type { QuotaMixinConfigStruct, SlashingMixinConfigStruct } from "../typechain-types/src/SafeHarbourPaymaster";

export type PaymasterConfig = {
	erc4337entryPoint: string;
	quotaConfig?: Partial<QuotaMixinConfigStruct>;
	slashingConfig?: Partial<SlashingMixinConfigStruct>;
};

export const paymasterConfigs: Record<string, PaymasterConfig> = {
	"100": {
		erc4337entryPoint: "0x4337084d9e255ff0702461cf8895ce9e3b5ff108",
		quotaConfig: {
			// WXDAI
			feeToken: "0xe91D153E0b41518A2Ce8Dd3D7944Fa863463a97d",
			quotaPerFeeTokenScale: 0,
			quotaPerFeeToken: 1,
			maxAvailableQuota: 0,
		},
	},
	"11155111": {
		erc4337entryPoint: "0x4337084d9e255ff0702461cf8895ce9e3b5ff108",
		quotaConfig: {
			// WETH used by CoW on Sepolia
			feeToken: "0xfFf9976782d46CC05630D1f6eBAb18b2324d6B14",
			quotaPerFeeTokenScale: 0,
			quotaPerFeeToken: 10,
			maxAvailableQuota: 0,
		},
	},
};

export default {};
