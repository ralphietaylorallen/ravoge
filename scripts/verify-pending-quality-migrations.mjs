// Non-persistent verification only. All new DDL and synthetic ordinary-role
// assertions are in one bounded transaction ending in ROLLBACK, not a deploy.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
const project = "kqdnljafaiohlijbgfld";
if (process.env.RAVOGE_ROLLBACK_QUALITY_QA !== "yes" || readFileSync("supabase/.temp/project-ref", "utf8").trim() !== project) throw new Error("Explicit Ravoge rollback test opt-in required");
const migrations = ["20261019051718_workout_quality_foundation.sql", "20261019051942_structured_programming_quality.sql", "20261019052328_structured_workout_generation.sql", "20261019052736_workout_player_readiness.sql"];
mkdirSync(".temp", { recursive: true });
const path = ".temp/pending-quality-rollback.sql";
const test = readFileSync("supabase/tests/workout_quality_rls.sql", "utf8").replace(/^begin;\s*/, "");
writeFileSync(path, `begin; set local lock_timeout='3s'; set local statement_timeout='60s';\n${migrations.map(file => readFileSync(`supabase/migrations/${file}`, "utf8")).join("\n")}\n${test}`);
try {
  execSync(`npx --yes supabase@2.117.0 db query --linked --file ${path} --agent no`, { stdio: "inherit", windowsHide: true });
  console.log("Pending quality migrations and ordinary authenticated RLS assertions passed and were rolled back. No migrations applied.");
} finally { rmSync(path, { force: true }); }
