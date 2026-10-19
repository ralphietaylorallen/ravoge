export type WeightCapability = { type: string; minLb: number | null; maxLb: number | null; sizesLb: number[] | null; pairsConfirmed?: boolean };
// Generated rows cannot smuggle an unverified absolute/percentage prescription
// into prose while the structured load remains null. Coach-entered notes remain editable.
export function generatedWeightTextIsLoadFree(...values: string[]) {
  return values.every(value => !/(?:\d+(?:\.\d+)?[\s-]*(?:lb\b|lbs\b|pounds?\b|%)|\b(?:lbs?|pounds?)\s*\d)/i.test(value));
}
export function parseWeightSizes(raw: string): number[] | null {
  if (!raw.trim()) return null;
  const parts = raw.split(/[,;\n]+/).map(s => s.trim());
  if (parts.length > 64 || parts.some(s => !/^\d+(?:\.\d{1,3})?$/.test(s) || Number(s) <= 0 || Number(s) > 100000)) throw new Error("Enter positive sizes in lb, separated by commas (up to three decimals).");
  return [...new Set(parts.map(Number))].sort((a, b) => a - b);
}
export function validateWeightRange(minLb: number | null, maxLb: number | null, sizesLb: number[] | null) {
  if ([minLb, maxLb].some(n => n !== null && (!Number.isFinite(n) || n <= 0 || n > 100000)) || (minLb !== null && maxLb !== null && minLb > maxLb)
    || sizesLb?.some(n => (minLb !== null && n < minLb) || (maxLb !== null && n > maxLb))) throw new Error("Use positive lb values, minimum no greater than maximum, and sizes within the saved range. Unknown values may remain blank.");
}
// Each confirmed size proves ONE matching pair, not unlimited quantities. With
// unknown pair counts, do not infer that repeated same-size pairs are available.
export function achievableBarbellLoads(capabilities: WeightCapability[]) {
  const bars = capabilities.filter(c => c.type === "barbell").flatMap(c => c.sizesLb ?? []);
  const plates = [...new Set(capabilities.filter(c => c.type === "plates" && c.pairsConfirmed).flatMap(c => c.sizesLb ?? []))];
  if (!bars.length || !plates.length) return null;
  if (plates.length > 16) throw new Error("Exact paired loading supports at most 16 distinct plate sizes.");
  let sums = new Set([0]);
  for (const plate of plates) sums = new Set([...sums, ...[...sums].map(n => n + Math.round(plate * 2000))]);
  return [...new Set(bars.flatMap(bar => [...sums].map(n => (Math.round(bar * 1000) + n) / 1000)))].sort((a,b) => a-b);
}
export function validatePoundLoad(load: number | null, requirements: string[], capabilities: WeightCapability[]): "exact" | "coach_confirmation" {
  if (load === null) return "coach_confirmation";
  if (!Number.isFinite(load) || load < 0 || load > 100000) throw new Error("Enter a valid load in lb.");
  if (requirements.includes("barbell")) {
    const bars = capabilities.filter(c => c.type === "barbell");
    if (bars.length && !bars.some(c => { const minimum = c.sizesLb?.length ? Math.min(...c.sizesLb) : c.minLb; return minimum === null || load >= minimum; })) throw new Error("Load is below the available unloaded bar weight in lb.");
    const exact = achievableBarbellLoads(capabilities);
    if (exact && !exact.some(n => Math.abs(n-load) < 0.00001)) throw new Error("That lb load cannot be assembled from the confirmed bars and one matched pair of each listed plate size.");
    return exact ? "exact" : "coach_confirmation";
  }
  const relevant = capabilities.filter(c => requirements.includes(c.type) && (c.minLb !== null || c.maxLb !== null || c.sizesLb?.length));
  if (!relevant.length) return "coach_confirmation";
  if (!relevant.some(c => (c.minLb === null || load >= c.minLb) && (c.maxLb === null || load <= c.maxLb) && (!c.sizesLb?.length || c.sizesLb.some(n => Math.abs(n-load)<0.00001)))) throw new Error("Load is outside the saved available weights in lb.");
  return relevant.some(c => c.sizesLb?.some(n => Math.abs(n-load)<0.00001)) ? "exact" : "coach_confirmation";
}
export function roundedPercentageLoad(referenceLb: number, percentage: number, requirements: string[], capabilities: WeightCapability[]) {
  if (!Number.isFinite(referenceLb) || referenceLb <= 0 || !Number.isFinite(percentage) || percentage <= 0 || percentage > 100) throw new Error("Enter a Coach-confirmed reference load in lb and a valid percentage.");
  const target = referenceLb * percentage / 100;
  const exact = requirements.includes("barbell") ? achievableBarbellLoads(capabilities) : capabilities.filter(c=>requirements.includes(c.type)).flatMap(c=>c.sizesLb??[]);
  const chosen = exact?.filter(n=>n<=target+0.00001).sort((a,b)=>b-a)[0];
  if (chosen === undefined) throw new Error("No achievable load can be confirmed from the saved sizes. Keep the load blank and review equipment.");
  validatePoundLoad(chosen, requirements, capabilities); return chosen;
}
