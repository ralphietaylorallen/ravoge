import assert from "node:assert/strict";
import test from "node:test";
import { requiresReviewedGymRetry } from "../../lib/workout-intelligence.ts";
import type { GenerationInput } from "../../lib/workout-generation.ts";
test("provider failure cannot silently replace compatible reviewed gym sources with global programming", () => {
  const input = { schemaVersion: 2, knowledgeCatalog: [{ id: "reviewed-source" }], references: [] } as unknown as GenerationInput;
  assert.equal(requiresReviewedGymRetry(input), true);
  assert.equal(requiresReviewedGymRetry({ ...input, knowledgeCatalog: [] }), false);
  assert.equal(requiresReviewedGymRetry({ ...input, references: input.knowledgeCatalog! }), false);
});
