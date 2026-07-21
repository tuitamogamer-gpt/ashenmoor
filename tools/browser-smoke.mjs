import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const port = 8974;
const base = `http://127.0.0.1:${port}/?test=1`;
const server = spawn(process.execPath, ["tools/serve.mjs", String(port)], { stdio: "ignore" });

async function waitForServer() {
  for (let i = 0; i < 80; i++) {
    try {
      const response = await fetch(base);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("Development server did not start");
}

function watchErrors(page, errors) {
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
}

async function beginAndKeep(page) {
  await page.locator('[data-act="begin"]').click();
  await page.locator('[data-act="mull-keep"]').click();
  const coach = page.locator('[data-act="coach-close"]');
  if (await coach.count()) await coach.click();
}

async function selectNonResource(page, useTouch = false) {
  const cards = page.locator("button.hcard");
  for (let i = 0; i < await cards.count(); i++) {
    const card = cards.nth(i);
    if (!((await card.getAttribute("aria-label")) || "").includes(", resource,")) {
      if (useTouch) await card.tap();
      else await card.click();
      return;
    }
  }
  throw new Error("Opening hand did not contain a playable card");
}

async function finishOneVillainPhase(page) {
  for (let i = 0; i < 30; i++) {
    await page.evaluate(() => window.advanceTime(10000));
    const action = page.locator('.modal [data-act="def-take"], .modal [data-act="reveal-resolve"], .modal [data-act="agenda-continue"], .modal.recap [data-act="close-modal"]');
    if (await action.count()) await action.first().click();
    const state = JSON.parse(await page.evaluate(() => window.render_game_to_text()));
    if (state.screen === "player" && state.round >= 2) return state;
  }
  throw new Error("Villain phase did not return control to the player");
}

await waitForServer();
await mkdir("output/browser-smoke", { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const desktopErrors = [];
  watchErrors(desktop, desktopErrors);
  await desktop.goto(base);
  await beginAndKeep(desktop);
  await selectNonResource(desktop);
  assert.equal(await desktop.locator(".inspector.open").isVisible(), true);
  assert.equal(await desktop.locator('.inspector [data-act="play"]').isVisible(), true);

  const state = JSON.parse(await desktop.evaluate(() => window.render_game_to_text()));
  assert.equal(state.screen, "player");
  assert.ok(state.hand.length > 0);
  assert.deepEqual(state.agenda.forecast, {
    active: true, spread: 1, scheme: 0, effects: 0, total: 1, remaining: state.agenda.threshold,
    advances: false, lethal: false,
  });
  assert.equal(await desktop.locator(".doom-next").textContent(), "NEXT +1");

  await desktop.locator('[data-act="restart"]').click();
  assert.equal(await desktop.locator(".confirm-modal").isVisible(), true);
  await desktop.locator('[data-act="confirm-cancel"]').click();
  assert.equal(await desktop.locator(".confirm-modal").count(), 0);

  await desktop.locator('[data-act="menu"]').click();
  await desktop.locator('[data-act="pm-mainmenu"]').click();
  await desktop.locator('[data-act="stats"]').click();
  assert.equal(await desktop.locator(".stats-modal").isVisible(), true);
  assert.deepEqual(desktopErrors, []);
  await desktop.screenshot({ path: "output/browser-smoke/desktop.png", fullPage: true });
  await desktop.close();

  const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const mobileErrors = [];
  watchErrors(mobile, mobileErrors);
  await mobile.goto(base);
  const beginBox = await mobile.locator('[data-act="begin"]').boundingBox();
  assert.ok(beginBox && beginBox.y + beginBox.height <= 844, "Begin button must be visible without scrolling");
  await beginAndKeep(mobile);
  await selectNonResource(mobile, true);
  const sheet = mobile.locator(".inspector.open");
  assert.equal(await sheet.isVisible(), true);
  assert.equal(await sheet.locator('[data-act="play"]').isVisible(), true);
  const sheetBox = await sheet.boundingBox();
  assert.ok(sheetBox && sheetBox.x >= 0 && sheetBox.x + sheetBox.width <= 390);
  assert.ok(sheetBox && sheetBox.y >= 0 && sheetBox.y + sheetBox.height <= 844);
  assert.deepEqual(mobileErrors, []);
  await mobile.screenshot({ path: "output/browser-smoke/mobile.png", fullPage: true });
  await mobile.locator('[data-act="inspector-close"]').click();
  await mobile.locator('[data-act="scheme"]').tap();
  const mobileDoomSheet = mobile.locator(".inspector.open");
  const mobileDoomDetails = mobile.locator(".inspector.open .doom-details");
  assert.equal(await mobileDoomDetails.isVisible(), true);
  assert.match(await mobileDoomDetails.textContent(), /Doom 0\/9.*NEXT \+1.*\+1 Spread/s);
  const doomSheetBox = await mobileDoomSheet.boundingBox();
  assert.ok(doomSheetBox && doomSheetBox.x >= 0 && doomSheetBox.x + doomSheetBox.width <= 390);
  assert.ok(doomSheetBox && doomSheetBox.y >= 0 && doomSheetBox.y + doomSheetBox.height <= 844);
  await mobile.screenshot({ path: "output/browser-smoke/mobile-doom-inspector.png" });
  await mobile.close();

  const flow = await browser.newPage({ viewport: { width: 1180, height: 780 } });
  const flowErrors = [];
  watchErrors(flow, flowErrors);
  await flow.goto(`${base}&dev=1`);
  await beginAndKeep(flow);
  const playable = flow.locator("button.hcard.canplay").first();
  assert.equal(await playable.isVisible(), true);
  await playable.click();
  await flow.locator('.inspector [data-act="play"]').click();
  const payConfirm = flow.locator('[data-act="pay-confirm"]');
  if (await payConfirm.count()) await payConfirm.click();
  const target = flow.locator("[data-target].targetable").first();
  if (await target.count()) await target.click();
  await flow.evaluate(() => {
    const state = window.AM.S;
    state.scheme.threat = window.AM.E.schemeThreshold(state) - 1;
    window.AM.commit();
  });
  const danger = JSON.parse(await flow.evaluate(() => window.render_game_to_text()));
  assert.equal(danger.agenda.forecast.advances, true);
  assert.equal(danger.agenda.forecast.lethal, false);
  assert.equal(await flow.locator(".doom-next.advance").textContent(), "ADVANCE +1");
  await flow.waitForTimeout(1600); // let the played-card showcase clear before visual assertions
  await flow.screenshot({ path: "output/browser-smoke/doom-forecast.png", fullPage: true });
  await flow.locator('[data-act="scheme"]').click();
  const doomDetails = flow.locator(".inspector.open .doom-details.advance");
  assert.equal(await doomDetails.isVisible(), true);
  assert.match(await doomDetails.textContent(), /Doom 8\/9.*ADVANCE \+1.*advance the agenda/s);
  await flow.screenshot({ path: "output/browser-smoke/doom-inspector.png", fullPage: true });
  await flow.locator('[data-act="inspector-close"]').click();
  await flow.locator('[data-act="end-turn"]').click();
  const nextRound = await finishOneVillainPhase(flow);
  assert.equal(nextRound.round, 2);
  assert.equal(nextRound.agenda.stage, 2);
  await flow.evaluate(() => {
    const state = window.AM.S;
    state.intent = "scheme";
    state.villainSealed = false;
    state.villain.attachments = [];
    state.sideSchemes = [];
    window.AM.commit();
  });
  const schemeRound = JSON.parse(await flow.evaluate(() => window.render_game_to_text()));
  assert.equal(schemeRound.agenda.forecast.spread, 1);
  assert.equal(schemeRound.agenda.forecast.scheme, 1);
  assert.equal(schemeRound.agenda.forecast.effects, 0);
  assert.equal(schemeRound.agenda.forecast.total, 2);
  assert.equal(await flow.locator(".doom-next").textContent(), "NEXT +2");
  assert.match(await flow.locator(".doom-breakdown").textContent(), /\+1 Spread.*\+1 Scheme/);
  await flow.waitForTimeout(1600); // let villain-phase VFX clear for the forecast screenshot
  await flow.screenshot({ path: "output/browser-smoke/doom-scheme-forecast.png", fullPage: true });
  assert.deepEqual(flowErrors, []);
  await flow.close();

  const boundary = await browser.newPage({ viewport: { width: 1180, height: 780 } });
  const boundaryErrors = [];
  watchErrors(boundary, boundaryErrors);
  await boundary.goto(`${base}&dev=1`);
  await beginAndKeep(boundary);
  await boundary.evaluate(() => {
    const state = window.AM.S;
    state.scheme.stage = 1;
    state.scheme.threat = window.AM.E.schemeThreshold(state) - 1;
    state.intent = "scheme";
    state.villainSealed = false;
    state.villain.attachments = [];
    state.sideSchemes = [];
    state.minions = [];
    window.AM.commit();
  });
  const boundaryState = JSON.parse(await boundary.evaluate(() => window.render_game_to_text()));
  assert.deepEqual(boundaryState.agenda.forecast, {
    active: true, spread: 1, scheme: 2, effects: 1, total: 4,
    remaining: 1, advances: true, lethal: false,
  });
  assert.equal(await boundary.locator(".doom-next.advance").textContent(), "ADVANCE +4");
  assert.match(await boundary.locator(".doom-breakdown").textContent(), /\+1 Spread.*\+2 Scheme.*\+1 Effects/);
  await boundary.screenshot({ path: "output/browser-smoke/doom-effects-forecast.png", fullPage: true });

  await boundary.evaluate(() => {
    const state = window.AM.S;
    state.scheme.stage = window.AM.E.agendaDef(state).stages.length - 1;
    state.scheme.threat = window.AM.E.schemeThreshold(state) - 1;
    state.intent = "attack";
    window.AM.commit();
  });
  assert.equal(await boundary.locator(".doom-next.lethal").textContent(), "DEFEAT +1");
  assert.match(await boundary.locator('[data-act="scheme"]').getAttribute("aria-label"), /complete the final agenda/);
  await boundary.screenshot({ path: "output/browser-smoke/doom-defeat-forecast.png", fullPage: true });
  await boundary.evaluate(() => {
    window.AM.E.endTurn(window.AM.S);
    window.AM.commit();
  });
  const resolving = JSON.parse(await boundary.evaluate(() => window.render_game_to_text()));
  assert.equal(resolving.agenda.forecast.active, false);
  assert.equal(await boundary.locator(".doom-next.resolving").textContent(), "RESOLVING");
  assert.deepEqual(boundaryErrors, []);
  await boundary.close();

  const daily = await browser.newPage({ viewport: { width: 900, height: 700 } });
  await daily.goto(base);
  await daily.locator('[data-act="daily"]').click();
  const firstDaily = JSON.parse(await daily.evaluate(() => window.render_game_to_text()));
  await daily.goto(base);
  await daily.locator('[data-act="daily"]').click();
  await daily.locator('[data-act="confirm-accept"]').click();
  const secondDaily = JSON.parse(await daily.evaluate(() => window.render_game_to_text()));
  assert.equal(firstDaily.dailyId, secondDaily.dailyId);
  assert.deepEqual(firstDaily.hand, secondDaily.hand);
  assert.equal(firstDaily.hero.id, secondDaily.hero.id);
  assert.equal(firstDaily.villain.id, secondDaily.villain.id);
  await daily.close();

  console.log("Browser smoke OK: desktop, mobile, full villain phase, and deterministic Daily Vigil flows");
} finally {
  await browser.close();
  server.kill("SIGTERM");
}
