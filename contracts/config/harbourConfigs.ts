import type { ERC4337MixinConfigStruct } from "../typechain-types/src/SafeInternationalHarbour";

export type HarbourConfig = {
	erc4337config?: Partial<ERC4337MixinConfigStruct>;
};

export const harbourConfigs: Record<string, HarbourConfig> = {
	"100": {
		erc4337config: {
			entryPoint: "0x4337084d9e255ff0702461cf8895ce9e3b5ff108",
		},
	},
	"11155111": {
		erc4337config: {
			entryPoint: "0x4337084d9e255ff0702461cf8895ce9e3b5ff108",
		},
	},
};

export default {};
