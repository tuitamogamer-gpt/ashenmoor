import { readdirSync } from "node:fs";
import { extname, join } from "node:path";
import { spawnSync } from "node:child_process";

const roots = ["js", "tools"];
const files = ["logic.js", "coop-logic.js"];

for (const root of roots) {
  for (const name of readdirSync(root)) {
    if ([".js", ".mjs"].includes(extname(name))) files.push(join(root, name));
  }
}

for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ["--check", file], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status || 1);
}

console.log(`Syntax OK: ${files.length} files`);
