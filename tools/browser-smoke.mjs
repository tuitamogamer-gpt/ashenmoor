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

async function selectNonResource(page) {
  const cards = page.locator("button.hcard");
  for (let i = 0; i < await cards.count(); i++) {
    const card = cards.nth(i);
    if (!((await card.getAttribute("aria-label")) || "").includes(", resource,")) {
      await card.click();
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
  await selectNonResource(mobile);
  const sheet = mobile.locator(".inspector.open");
  assert.equal(await sheet.isVisible(), true);
  assert.equal(await sheet.locator('[data-act="play"]').isVisible(), true);
  const sheetBox = await sheet.boundingBox();
  assert.ok(sheetBox && sheetBox.x >= 0 && sheetBox.x + sheetBox.width <= 390);
  assert.ok(sheetBox && sheetBox.y >= 0 && sheetBox.y + sheetBox.height <= 844);
  assert.deepEqual(mobileErrors, []);
  await mobile.screenshot({ path: "output/browser-smoke/mobile.png", fullPage: true });
  await mobile.close();

  const flow = await browser.newPage({ viewport: { width: 1180, height: 780 } });
  const flowErrors = [];
  watchErrors(flow, flowErrors);
  await flow.goto(base);
  await beginAndKeep(flow);
  const playable = flow.locator("button.hcard.canplay").first();
  assert.equal(await playable.isVisible(), true);
  await playable.click();
  await flow.locator('.inspector [data-act="play"]').click();
  const payConfirm = flow.locator('[data-act="pay-confirm"]');
  if (await payConfirm.count()) await payConfirm.click();
  const target = flow.locator("[data-target].targetable").first();
  if (await target.count()) await target.click();
  await flow.locator('[data-act="end-turn"]').click();
  const nextRound = await finishOneVillainPhase(flow);
  assert.equal(nextRound.round, 2);
  assert.deepEqual(flowErrors, []);
  await flow.close();

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
