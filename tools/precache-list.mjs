// The files the offline copy of the game needs, derived from the real data so
// sw.js can be regenerated (tools/gen-sw.mjs) and checked (test/sw.test.mjs).
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { HEROES, CARDS, ENCOUNTERS, VILLAINS } from "../js/cards.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const list = (dir, exts) => readdirSync(join(root, dir))
  .filter((name) => exts.some((ext) => name.endsWith(ext)))
  .map((name) => `./${dir}/${name}`);

// art the UI can actually show: every card, hero, villain and agenda, plus
// the menu / campaign / card-back / favicon images (unused art is skipped)
export function usedArt() {
  return new Set([
    ...Object.keys(CARDS), ...Object.keys(ENCOUNTERS),
    ...Object.values(HEROES).map((h) => h.art),
    ...Object.values(VILLAINS).flatMap((v) => [v.art, v.agenda.art]),
    "thumbnail", "cardback", "campaign_road", "favicon",
  ]);
}

export function precacheList() {
  const art = usedArt();
  return [
    "./", "./index.html", "./manifest.webmanifest", "./strings.js", "./css/style.css",
    ...list("js", [".js"]),
    ...list("assets/fonts", [".woff2"]),
    ...list("assets/icons", [".jpg", ".png"]),
    ...list("assets/sfx", [".mp3"]),
    ...list("assets/art", [".jpg"]).filter((p) => art.has(p.slice("./assets/art/".length, -4))),
  ].sort();
}

export const appVersion = () => JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
export const swPath = join(root, "sw.js");
