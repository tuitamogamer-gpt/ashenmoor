#!/usr/bin/env node
// ============================================================
// ASHENMOOR — generate real sound effects via ElevenLabs.
// Usage: node tools/gen-sfx.mjs [--key sk_...] [--force] [--only name,name]
// Writes assets/sfx/<name>.mp3 for every sound in js/fx.js SFX_DEFS
// plus three ambience loops. Idempotent: skips files that exist
// (use --force to regenerate). Requires an API key with the
// "Sound Effects" (sound_generation) permission enabled.
// ============================================================
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "assets", "sfx");
const API = "https://api.elevenlabs.io/v1/sound-generation";

// { text, dur (s), pi (prompt_influence), loop }
const SOUNDS = {
  click:    { text: "Soft stone click, subtle dark fantasy user interface tick, single very short click", dur: 0.5, pi: 0.75 },
  deny:     { text: "Dull muted double knock on old wood, negative denial thud, short error feedback", dur: 0.6, pi: 0.7 },
  draw:     { text: "A single playing card drawn from a deck with a crisp paper slide", dur: 0.6, pi: 0.75 },
  play:     { text: "A playing card slapped down firmly onto a stone table with a faint magical shimmer", dur: 0.9, pi: 0.65 },
  attack:   { text: "Sharp sword slash whoosh ending in a heavy metallic impact, fantasy combat", dur: 1.0, pi: 0.65 },
  thwart:   { text: "Bright arcane chime rising, dark magic dispelling into fading sparkles", dur: 1.0, pi: 0.6 },
  dmg:      { text: "Heavy blunt body impact with a dark painful thump, fantasy combat damage", dur: 0.8, pi: 0.65 },
  heal:     { text: "Warm healing magic shimmer, gentle rising glow with soft bell tones", dur: 1.5, pi: 0.6 },
  shield:   { text: "Metal shield raised with a resonant protective ring and a low magic ward hum", dur: 1.0, pi: 0.6 },
  block:    { text: "Sword clanging hard against a metal shield, sharp ringing impact", dur: 0.8, pi: 0.7 },
  threat:   { text: "Deep ominous ritual drum hit with a dark sub bass swell of dread", dur: 1.5, pi: 0.6 },
  threatDn: { text: "Dark energy dissipating with an airy purifying chime of relief", dur: 1.0, pi: 0.6 },
  reveal:   { text: "Quick card flip into a tense dark orchestral sting, ominous reveal", dur: 1.2, pi: 0.6 },
  spawn:    { text: "Dark portal whoosh and a monstrous guttural snarl as a creature emerges", dur: 1.4, pi: 0.65 },
  incoming: { text: "A short distant war horn blast echoing over a battlefield, ominous warning", dur: 1.3, pi: 0.65 },
  kill:     { text: "Monster dying groan with a heavy body collapsing to the ground", dur: 1.3, pi: 0.65 },
  stage:    { text: "Massive dark power surge, deep evil choir hit with rolling thunder, villain transformation", dur: 2.2, pi: 0.6 },
  win:      { text: "Somber triumphant medieval fanfare with brass and low choir, dark fantasy victory", dur: 3.5, pi: 0.55 },
  lose:     { text: "Tragic funeral bell toll with low descending strings, dark fantasy defeat", dur: 3.5, pi: 0.55 },
  turn:     { text: "A single deep resonant bell toll, calm and dark, marking a new turn", dur: 1.0, pi: 0.7 },
  whoosh:   { text: "Fast arcane energy whoosh flying past, magical projectile", dur: 0.8, pi: 0.65 },
  nova:     { text: "Huge arcane fire explosion with a deep rumbling shockwave", dur: 2.0, pi: 0.6 },
  heartbeat:{ text: "Slow deep human heartbeat, two heavy tense beats", dur: 1.4, pi: 0.75 },
  shatter:  { text: "Large stone statue shattering into debris with glassy crystal shards scattering", dur: 1.5, pi: 0.65 },
  rally:    { text: "Heroic rallying horn flourish with swords raised and a brief warrior shout", dur: 1.5, pi: 0.6 },
  amb_calm: { text: "Dark fantasy ambience, cold wind over ashen moorland, distant embers crackling, low ominous drone, no melody, seamless loop", dur: 20, pi: 0.5, loop: true },
  amb_tense:{ text: "Tense dark ambience, slow deep war drums, whispering ghostly voices, rising dread, seamless loop", dur: 20, pi: 0.5, loop: true },
  amb_doom: { text: "Apocalyptic dark ambience, pounding war drums, low demonic choir chanting, distant thunder, seamless loop", dur: 20, pi: 0.5, loop: true },
};

const args = process.argv.slice(2);
const argKey = args.includes("--key") ? args[args.indexOf("--key") + 1] : null;
const force = args.includes("--force");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;

function candidateKeys() {
  const keys = [];
  if (argKey) keys.push(argKey);
  if (process.env.ELEVENLABS_API_KEY) keys.push(process.env.ELEVENLABS_API_KEY);
  try {
    const zshrc = readFileSync(join(homedir(), ".zshrc"), "utf8");
    for (const m of zshrc.matchAll(/ELEVENLABS_API_KEY="?(sk_[a-f0-9]+)"?/gi)) keys.push(m[1]);
  } catch {}
  try {
    const cfg = JSON.parse(readFileSync(join(homedir(), ".claude.json"), "utf8"));
    const k = cfg?.mcpServers?.["elevenlabs-scribe"]?.env?.ELEVENLABS_API_KEY;
    if (k) keys.push(k);
  } catch {}
  return [...new Set(keys)];
}

// empty-text probe: 422 = permission OK (validation error), 401 = no permission
async function probe(key) {
  const r = await fetch(API, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ text: "" }),
  });
  return r.status !== 401;
}

async function findKey() {
  for (const k of candidateKeys()) {
    if (await probe(k)) return k;
  }
  return null;
}

async function generate(key, name, spec, attempt = 1) {
  const body = { text: spec.text, duration_seconds: spec.dur, prompt_influence: spec.pi };
  if (spec.loop && attempt === 1) body.loop = true; // drop on retry if API rejects it
  const r = await fetch(API, {
    method: "POST",
    headers: { "xi-api-key": key, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (r.status === 429 && attempt <= 3) {
    await new Promise((res) => setTimeout(res, 4000 * attempt));
    return generate(key, name, spec, attempt + 1);
  }
  if (!r.ok) {
    const err = await r.text();
    if (spec.loop && attempt === 1 && /loop/i.test(err)) return generate(key, name, spec, 2);
    throw new Error(`${name}: HTTP ${r.status} ${err.slice(0, 180)}`);
  }
  const buf = Buffer.from(await r.arrayBuffer());
  const isMp3 = buf.length > 4000 && (buf.toString("latin1", 0, 3) === "ID3" || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0));
  if (!isMp3) {
    if (attempt <= 2) return generate(key, name, spec, attempt + 1);
    throw new Error(`${name}: response is not valid mp3 (${buf.length} bytes)`);
  }
  writeFileSync(join(OUT, `${name}.mp3`), buf);
  return buf.length;
}

const key = await findKey();
if (!key) {
  console.error("No ElevenLabs API key with the sound_generation permission was found.");
  console.error("Enable 'Sound Effects' on a key at https://elevenlabs.io -> Developers -> API Keys,");
  console.error("or pass one with: node tools/gen-sfx.mjs --key sk_...");
  process.exit(1);
}
console.log(`Using key ...${key.slice(-6)} — generating into ${OUT}`);
mkdirSync(OUT, { recursive: true });

const todo = Object.entries(SOUNDS).filter(([n]) =>
  (!only || only.includes(n)) && (force || !existsSync(join(OUT, `${n}.mp3`))));
if (todo.length === 0) { console.log("Nothing to do — all files exist (use --force)."); process.exit(0); }
console.log(`${todo.length} sound(s) to generate...`);

let ok = 0, failed = [];
const queue = [...todo];
await Promise.all(Array.from({ length: 3 }, async () => {
  while (queue.length) {
    const [name, spec] = queue.shift();
    try {
      const bytes = await generate(key, name, spec);
      ok++;
      console.log(`  ok ${name}.mp3 (${(bytes / 1024).toFixed(0)} KB)`);
    } catch (e) {
      failed.push(name);
      console.error(`  FAIL ${e.message}`);
    }
  }
}));
console.log(`Done: ${ok} generated, ${failed.length} failed${failed.length ? " (" + failed.join(", ") + ")" : ""}.`);
process.exit(failed.length ? 2 : 0);
