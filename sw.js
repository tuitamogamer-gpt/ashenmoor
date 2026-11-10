// ============================================================
// ASHENMOOR — offline support (service worker).
// Network-first for everything: an online player always gets the files that
// are deployed right now, and the cache is only a fallback once the network
// is gone. A forgotten version bump can therefore never pin a stale build.
// The precache list below is generated: node tools/gen-sw.mjs
// ============================================================
const CACHE = "ashenmoor-v2.7.0";
const PRECACHE = [
  // PRECACHE:START
  "./",
  "./assets/art/aegis_plate.jpg",
  "./assets/art/apprentice_scryer.jpg",
  "./assets/art/ash_revenant.jpg",
  "./assets/art/ashen_duelist.jpg",
  "./assets/art/banish.jpg",
  "./assets/art/battle_fury.jpg",
  "./assets/art/beast_bond.jpg",
  "./assets/art/bone_choir.jpg",
  "./assets/art/briar_bear.jpg",
  "./assets/art/bulwark.jpg",
  "./assets/art/call_of_the_moor.jpg",
  "./assets/art/campaign_road.jpg",
  "./assets/art/cardback.jpg",
  "./assets/art/chant_of_hollowing.jpg",
  "./assets/art/chorus_of_the_dead.jpg",
  "./assets/art/cinder_hound.jpg",
  "./assets/art/cinder_of_the_first_flame.jpg",
  "./assets/art/cleaving_arc.jpg",
  "./assets/art/creeping_despair.jpg",
  "./assets/art/crown_of_echoes.jpg",
  "./assets/art/crowning_ritual.jpg",
  "./assets/art/ember_slash.jpg",
  "./assets/art/ember_veteran.jpg",
  "./assets/art/emberbrand.jpg",
  "./assets/art/favicon.jpg",
  "./assets/art/feast_of_shadows.jpg",
  "./assets/art/focus_crystal.jpg",
  "./assets/art/foresight.jpg",
  "./assets/art/grave_thrall.jpg",
  "./assets/art/gravekeeper.jpg",
  "./assets/art/harvest_of_souls.jpg",
  "./assets/art/herald_of_the_spire.jpg",
  "./assets/art/hero_ilva.jpg",
  "./assets/art/hero_kaelen.jpg",
  "./assets/art/hero_nul.jpg",
  "./assets/art/hero_odran.jpg",
  "./assets/art/hero_sera.jpg",
  "./assets/art/hero_vexahl.jpg",
  "./assets/art/hex_of_cinders.jpg",
  "./assets/art/hollow_beast.jpg",
  "./assets/art/hungering_blade.jpg",
  "./assets/art/judgment_bell.jpg",
  "./assets/art/lantern_bearer.jpg",
  "./assets/art/last_bastion.jpg",
  "./assets/art/mirror_ward.jpg",
  "./assets/art/moor_hawk.jpg",
  "./assets/art/oath_of_iron.jpg",
  "./assets/art/obsidian_ward.jpg",
  "./assets/art/pack_tactics.jpg",
  "./assets/art/pale_shepherd.jpg",
  "./assets/art/pyre_burst.jpg",
  "./assets/art/rally_the_watch.jpg",
  "./assets/art/rallying_cry.jpg",
  "./assets/art/reckless_charge.jpg",
  "./assets/art/rift_bolt.jpg",
  "./assets/art/rift_stalker.jpg",
  "./assets/art/rite_of_binding.jpg",
  "./assets/art/ritual_of_the_crown.jpg",
  "./assets/art/rot_bloom.jpg",
  "./assets/art/scheme_hollowing.jpg",
  "./assets/art/scheme_nul.jpg",
  "./assets/art/scheme_oszra.jpg",
  "./assets/art/scheme_vexahl.jpg",
  "./assets/art/second_wind.jpg",
  "./assets/art/sentinel_golem.jpg",
  "./assets/art/shard_of_the_spire.jpg",
  "./assets/art/shattered_nerves.jpg",
  "./assets/art/shield_wall.jpg",
  "./assets/art/shroud_of_mourning.jpg",
  "./assets/art/sigil_of_clarity.jpg",
  "./assets/art/silvered_tongue.jpg",
  "./assets/art/spire_shrike.jpg",
  "./assets/art/stagger.jpg",
  "./assets/art/stampede.jpg",
  "./assets/art/stand_fast.jpg",
  "./assets/art/stone_sentry.jpg",
  "./assets/art/temporal_slip.jpg",
  "./assets/art/the_court_convenes.jpg",
  "./assets/art/the_great_chant.jpg",
  "./assets/art/thorn_ward.jpg",
  "./assets/art/thorn_wolf.jpg",
  "./assets/art/thumbnail.jpg",
  "./assets/art/tithe_of_whispers.jpg",
  "./assets/art/unravel.jpg",
  "./assets/art/veil_of_despair.jpg",
  "./assets/art/veil_of_mist.jpg",
  "./assets/art/verdict.jpg",
  "./assets/art/vigil_banner.jpg",
  "./assets/art/villain_morvane.jpg",
  "./assets/art/villain_oszra.jpg",
  "./assets/art/void_cultist.jpg",
  "./assets/art/void_edge.jpg",
  "./assets/art/void_lash.jpg",
  "./assets/art/void_siphon.jpg",
  "./assets/art/wardens_beacon.jpg",
  "./assets/art/wardens_oath.jpg",
  "./assets/art/wardens_resolve.jpg",
  "./assets/art/wardplate.jpg",
  "./assets/art/watch_captain.jpg",
  "./assets/art/whispers_of_the_spire.jpg",
  "./assets/art/wild_mending.jpg",
  "./assets/fonts/cinzel-latin.woff2",
  "./assets/fonts/ebgaramond-italic-latin.woff2",
  "./assets/fonts/ebgaramond-latin.woff2",
  "./assets/icons/app-180.png",
  "./assets/icons/app-192.png",
  "./assets/icons/app-512.png",
  "./assets/icons/app-maskable-512.png",
  "./assets/icons/ic_ab_aegis.jpg",
  "./assets/icons/ic_ab_emberheart.jpg",
  "./assets/icons/ic_ab_riftsight.jpg",
  "./assets/icons/ic_ab_wildcall.jpg",
  "./assets/icons/ic_atk.jpg",
  "./assets/icons/ic_burst.jpg",
  "./assets/icons/ic_def.jpg",
  "./assets/icons/ic_doom.jpg",
  "./assets/icons/ic_hp.jpg",
  "./assets/icons/ic_res.jpg",
  "./assets/icons/ic_sch.jpg",
  "./assets/icons/ic_thw.jpg",
  "./assets/sfx/amb_calm.mp3",
  "./assets/sfx/amb_doom.mp3",
  "./assets/sfx/amb_tense.mp3",
  "./assets/sfx/attack.mp3",
  "./assets/sfx/block.mp3",
  "./assets/sfx/click.mp3",
  "./assets/sfx/deny.mp3",
  "./assets/sfx/dmg.mp3",
  "./assets/sfx/draw.mp3",
  "./assets/sfx/heal.mp3",
  "./assets/sfx/heartbeat.mp3",
  "./assets/sfx/incoming.mp3",
  "./assets/sfx/kill.mp3",
  "./assets/sfx/lose.mp3",
  "./assets/sfx/nova.mp3",
  "./assets/sfx/play.mp3",
  "./assets/sfx/rally.mp3",
  "./assets/sfx/reveal.mp3",
  "./assets/sfx/shatter.mp3",
  "./assets/sfx/shield.mp3",
  "./assets/sfx/spawn.mp3",
  "./assets/sfx/stage.mp3",
  "./assets/sfx/threat.mp3",
  "./assets/sfx/threatDn.mp3",
  "./assets/sfx/thwart.mp3",
  "./assets/sfx/turn.mp3",
  "./assets/sfx/whoosh.mp3",
  "./assets/sfx/win.mp3",
  "./css/style.css",
  "./index.html",
  "./js/campaign.js",
  "./js/cards.js",
  "./js/config.js",
  "./js/engine.js",
  "./js/fx.js",
  "./js/icons.js",
  "./js/rng.js",
  "./js/ui.js",
  "./js/vfx.js",
  "./manifest.webmanifest",
  "./strings.js",
  // PRECACHE:END
];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // with Save-Data on, keep only what was actually played (runtime caching)
    const lite = !!self.navigator?.connection?.saveData;
    const files = lite ? PRECACHE.filter((url) => !url.startsWith("./assets/art/") && !url.startsWith("./assets/sfx/")) : PRECACHE;
    // one missing file must not cost the whole offline copy
    await Promise.allSettled(files.map((url) => cache.add(url)));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("ashenmoor-") && key !== CACHE).map((key) => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      // full, same-origin, non-redirected answers only (206 ranges can't be cached)
      if (response.status === 200 && response.type === "basic" && !response.redirected) {
        const copy = response.clone();
        event.waitUntil(caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {}));
      }
      return response;
    } catch (error) {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(request, { ignoreSearch: true });
      if (hit) return hit;
      if (request.mode === "navigate") {
        const shell = (await cache.match("./")) || (await cache.match("./index.html"));
        if (shell) return shell;
      }
      throw error;
    }
  })());
});
