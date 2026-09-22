import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const target = process.env.SUPABASE_DB_TARGET === "local" ? "--local" : "--linked";
const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const files = readdirSync("supabase/tests").filter((file) => file.endsWith(".sql")).sort();

for (const file of files) {
  process.stdout.write(`\nDatabase test: ${file}\n`);
  execFileSync(executable, ["--yes", "supabase@2.117.0", "db", "query", target, "--file", join("supabase/tests", file), "--agent", "no"], {
    stdio: "inherit",
  });
}
