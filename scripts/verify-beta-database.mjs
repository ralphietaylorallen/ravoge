// Test pending DDL and ordinary authenticated contexts in a single rolled-back
// transaction. No migration history is written and no production changes persist.
import { execSync } from "node:child_process";
import { readFileSync, readdirSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
const project = "kqdnljafaiohlijbgfld";
if (process.env.RAVOGE_VERIFY_PENDING_MIGRATIONS !== "yes" || readFileSync("supabase/.temp/project-ref", "utf8").trim() !== project) throw new Error("Explicit Ravoge pending-migration test opt-in required.");
const migrations = ["20261015203006_beta_invitation_access.sql", "20261015203008_reviewed_training_generation.sql"];
const requested = process.argv.slice(2);
const suites = requested.length ? requested : readdirSync("supabase/tests").filter(name => name.endsWith(".sql")).sort();
mkdirSync(".temp", { recursive: true });
for (const name of suites) {
  if (!/^[a-z0-9_]+\.sql$/.test(name)) throw new Error("Invalid suite name");
  const suite = readFileSync(`supabase/tests/${name}`, "utf8");
  if (!/^\s*begin;/i.test(suite) || !/rollback;\s*$/i.test(suite) || /\bcommit\s*;/i.test(suite)) throw new Error("Only rollback-only suites are allowed");
  const body = suite.replace(/^\s*begin;/i, "").replace(/rollback;\s*$/i, "");
  const file = ".temp/beta-pending-verification.sql";
  writeFileSync(file, `begin;\nset local lock_timeout='5s';\n${migrations.map(file => readFileSync(`supabase/migrations/${file}`, "utf8")).join("\n")}\n${body}\nrollback;`);
  try {
    execSync(`npx --yes supabase@2.117.0 db query --linked --file ${file} --agent no`, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8", windowsHide: true });
    console.log(`PASS (rolled back): ${name}`);
  } catch (error) {
    const message = String(error.stderr ?? error.message).replace(/(token|password|key)=[^\s]+/gi, "$1=[redacted]");
    console.error(`FAIL (transaction not committed): ${name}\n${message.slice(0, 5000)}`);
    process.exitCode = 1;
    break;
  } finally { rmSync(file, { force: true }); }
}
