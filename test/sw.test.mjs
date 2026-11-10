import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { precacheList, appVersion, swPath } from "../tools/precache-list.mjs";

const sw = readFileSync(swPath, "utf8");
const listed = [...sw.matchAll(/^ {2}"(\.\/[^"]*)",$/gm)].map((m) => m[1]);

test("service worker precaches exactly the files the game uses (run node tools/gen-sw.mjs)", () => {
  assert.deepEqual(listed, precacheList());
});

test("every precached file exists on disk", () => {
  for (const file of listed) {
    if (file === "./") continue;
    assert.ok(existsSync(new URL(`../${file.slice(2)}`, import.meta.url)), `${file} is missing`);
  }
});

test("service worker cache name follows the app version", () => {
  assert.match(sw, new RegExp(`const CACHE = "ashenmoor-v${appVersion().replace(/\./g, "\\.")}";`));
});

test("web manifest points at real, correctly sized app icons", async () => {
  const manifest = JSON.parse(readFileSync(new URL("../manifest.webmanifest", import.meta.url), "utf8"));
  assert.equal(manifest.display, "standalone");
  assert.ok(manifest.icons.some((icon) => icon.sizes === "192x192"));
  assert.ok(manifest.icons.some((icon) => icon.sizes === "512x512" && icon.purpose === "maskable"));
  for (const icon of manifest.icons) {
    const png = readFileSync(new URL(`../${icon.src}`, import.meta.url));
    // PNG IHDR: width and height are big-endian uint32 at bytes 16 and 20
    const [w, h] = icon.sizes.split("x").map(Number);
    assert.equal(png.readUInt32BE(16), w, `${icon.src} width`);
    assert.equal(png.readUInt32BE(20), h, `${icon.src} height`);
  }
});
