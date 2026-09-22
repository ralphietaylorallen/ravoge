import "server-only";

export type EquipmentScanEnvironment = {
  EQUIPMENT_SCAN_ENABLED?: string;
  OPENAI_API_KEY?: string;
};

export function getEquipmentScanConfiguration(environment: EquipmentScanEnvironment = {
  EQUIPMENT_SCAN_ENABLED: process.env.EQUIPMENT_SCAN_ENABLED,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
}) {
  return {
    enabled: environment.EQUIPMENT_SCAN_ENABLED === "true",
    keyConfigured: Boolean(environment.OPENAI_API_KEY?.trim()),
  };
}
