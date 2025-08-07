import type { SlashingMixinConfigStruct } from "../../typechain-types/src/SafeHarbourPaymaster";

export function buildSlashingConfig(params?: Partial<SlashingMixinConfigStruct>): SlashingMixinConfigStruct {
	return {
		enableCoditionsDelay: params?.enableCoditionsDelay || 2 * 24 * 3600,
		initialConditions: params?.initialConditions || [],
	};
}
