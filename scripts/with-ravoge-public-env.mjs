// Read the existing Ravoge publishable key into child-process memory only.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
const project = "kqdnljafaiohlijbgfld";
if (readFileSync("supabase/.temp/project-ref", "utf8").trim() !== project) throw new Error("Ravoge project link mismatch");
const command = process.argv[2];
if (!["build", "test:e2e"].includes(command)) throw new Error("Only build and test:e2e are supported");
const keys = JSON.parse(execSync(`npx --yes supabase@2.117.0 projects api-keys --project-ref ${project} -o json --agent no`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], windowsHide: true }));
const key = keys.find(value => value.type === "publishable")?.api_key;
if (!key?.startsWith("sb_publishable_")) throw new Error("Ravoge publishable key unavailable");
execSync(`npm run ${command}`, { stdio: "inherit", windowsHide: true, env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `https://${project}.supabase.co`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: key } });
