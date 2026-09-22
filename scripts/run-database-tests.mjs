import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const isLocal = process.env.SUPABASE_DB_TARGET === "local";
const executable = process.platform === "win32" ? "npx.cmd" : "npx";
const files = readdirSync("supabase/tests").filter((file) => file.endsWith(".sql")).sort();
const projectId = readFileSync("supabase/config.toml", "utf8").match(/^project_id\s*=\s*"([^"]+)"/m)?.[1];

if (isLocal && !projectId) {
  throw new Error("Supabase project_id is missing from supabase/config.toml.");
}

for (const file of files) {
  const path = join("supabase/tests", file);
  process.stdout.write(`\nDatabase test: ${file}\n`);
  if (isLocal) {
    execFileSync("docker", ["exec", "-i", `supabase_db_${projectId}`, "psql", "--username", "postgres", "--dbname", "postgres", "--set", "ON_ERROR_STOP=on"], {
      input: readFileSync(path),
      stdio: ["pipe", "inherit", "inherit"],
    });
  } else {
    execFileSync(executable, ["--yes", "supabase@2.117.0", "db", "query", "--linked", "--file", path, "--agent", "no"], {
      stdio: "inherit",
    });
  }
}
