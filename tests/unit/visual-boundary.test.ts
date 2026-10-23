import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("visual theme is presentation-only and respects reduced motion", () => {
  const shell = readFileSync("components/visual-theme.tsx", "utf8");
  const css = readFileSync("components/visual-theme.module.css", "utf8");
  assert.doesNotMatch(shell, /supabase|localStorage|document\.cookie|fetch\(|server action/);
  assert.match(shell, /children/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /focus-visible/);
  assert.match(css, /--ui-button-background:/);
});
