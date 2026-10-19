// Non-persistent verification only. All new DDL and synthetic ordinary-role
// assertions are in one bounded transaction ending in ROLLBACK, not a deploy.
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, readdirSync } from "node:fs";
const project = "kqdnljafaiohlijbgfld";
if (process.env.RAVOGE_ROLLBACK_QUALITY_QA !== "yes" || readFileSync("supabase/.temp/project-ref", "utf8").trim() !== project) throw new Error("Explicit Ravoge rollback test opt-in required");
const migrations = process.env.RAVOGE_QUALITY_PENDING_FILES?.split(",") ?? ["20261019051718_workout_quality_foundation.sql", "20261019051942_structured_programming_quality.sql", "20261019052328_structured_workout_generation.sql", "20261019052736_workout_player_readiness.sql"];
if (!migrations.length || migrations.some(file => !/^\d{14}_[a-z0-9_]+\.sql$/.test(file))) throw new Error("Explicit repository migration filenames required");
mkdirSync(".temp", { recursive: true });
const path = ".temp/pending-quality-rollback.sql";
const testFile = process.env.RAVOGE_QUALITY_SQL_TEST ?? "workout_quality_rls.sql";
if (testFile !== "all" && !/^[a-z0-9_]+\.sql$/.test(testFile)) throw new Error("Repository SQL test filename required");
const files = testFile === "all" ? readdirSync("supabase/tests").filter(file => file.endsWith(".sql")).sort() : [testFile];
const test = files.map(file => {
  const original = readFileSync(`supabase/tests/${file}`, "utf8");
  if (!/^begin;\s*$/im.test(original) || !/^rollback;\s*$/im.test(original)) throw new Error(`Rollback-bounded repository test required: ${file}`);
  const body = original.replace(/^begin;\s*$/im, "").replace(/^rollback;\s*$/im, "");
  return `savepoint isolated_quality_suite;\n${body}\nrollback to savepoint isolated_quality_suite; release savepoint isolated_quality_suite;\n`;
}).join("\n") + "rollback;";
writeFileSync(path, `begin; set local lock_timeout='3s'; set local statement_timeout='60s';\n${migrations.map(file => readFileSync(`supabase/migrations/${file}`, "utf8")).join("\n")}\n${test}`);
try {
  execSync(`npx --yes supabase@2.117.0 db query --linked --file ${path} --agent no`, { stdio: "inherit", windowsHide: true });
  console.log(`Pending quality migrations and ${files.length} ordinary authenticated SQL/RLS suite(s) passed and were rolled back. No migrations applied.`);
} finally { rmSync(path, { force: true }); }
