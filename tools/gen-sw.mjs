// Rewrites the precache list and cache version inside sw.js.
// Run after adding or removing art, icons, sounds or modules:
//   node tools/gen-sw.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { precacheList, appVersion, swPath } from "./precache-list.mjs";

const src = readFileSync(swPath, "utf8");
const files = precacheList();
const body = files.map((f) => `  "${f}",`).join("\n");
const out = src
  .replace(/const CACHE = "ashenmoor-[^"]*";/, `const CACHE = "ashenmoor-v${appVersion()}";`)
  .replace(/\/\/ PRECACHE:START[\s\S]*?\/\/ PRECACHE:END/, `// PRECACHE:START\n${body}\n  // PRECACHE:END`);
writeFileSync(swPath, out);
console.log(`sw.js: ${files.length} files, cache ashenmoor-v${appVersion()}`);
