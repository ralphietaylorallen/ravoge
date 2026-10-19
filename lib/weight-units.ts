// Existing assessment storage stays canonical. Convert only at the input/output
// boundary; never mutate a historical measurement merely to display it.
export const POUNDS_PER_KILOGRAM = 2.20462262185;
type Weight = number | string | null | undefined;
function numeric(value: Weight): number | null {
  if (value === null || value === undefined || value === "" || (typeof value === "string" && !value.trim())) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) throw new Error("Enter a finite weight in lb.");
  return n;
}
export function poundsToKilograms(value: Weight) { const n = numeric(value); return n === null ? null : n / POUNDS_PER_KILOGRAM; }
export function kilogramsToPounds(value: Weight) { const n = numeric(value); return n === null ? null : n * POUNDS_PER_KILOGRAM; }
export function loadInPounds(value: Weight, unit: string | null | undefined) {
  return unit === "kg" ? kilogramsToPounds(value) : unit === "lb" ? numeric(value) : null;
}
export function formatPounds(value: Weight) { const n = numeric(value); return n === null ? "—" : n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
export function canonicalPounds(value: Weight) { return formatPounds(kilogramsToPounds(value)); }
export function loadLabel(value: Weight, unit?: string | null) {
  if (numeric(value) === null) return "Load not prescribed";
  const lb = loadInPounds(value, unit);
  return lb === null ? "Historical load unit unrecorded — confirm a load in lb" : `${formatPounds(lb)} lb`;
}
// Editing an existing canonical value needs more precision than a read-only
// one-decimal summary. This avoids accumulated rounding on unchanged resaves.
export function poundsInputFromCanonical(value: Weight) {
  const lb = kilogramsToPounds(value);
  return lb === null ? "" : Number(lb.toFixed(10)).toString();
}
export function poundsInText(value: string) {
  return value.replace(/\b(\d+(?:\.\d+)?)\s*(?:kg|kilograms?)\b/gi, (_, n) => `${canonicalPounds(n)} lb`);
}
