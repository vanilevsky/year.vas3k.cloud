import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const EMAIL = "test@yearplanner.dev";
const PASSWORD = "testpass123";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function removeOverlay(page) {
  await page.evaluate(() => {
    document.getElementById("webpack-dev-server-client-overlay")?.remove();
  });
}

async function signIn(page) {
  await removeOverlay(page);
  await page.click("button:has-text('Sign in')");
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click("button:has-text('Sign in'):not(:has-text('up'))");
  await page.waitForSelector("button:has-text('Sign out')", { timeout: 10000 });
  console.log("  Signed in");
}

// Click a .day cell at position {x:3,y:3} to avoid the inner text div
// which has e.target !== e.currentTarget guard
async function clickDayCell(page, nth) {
  const cell = page.locator(".day").nth(nth);
  await cell.click({ position: { x: 3, y: 3 } });
}

async function countColoredCells(page) {
  return page.evaluate(() => {
    return document.querySelectorAll('.day[data-colored="true"]').length;
  });
}

// ──────────────────────────────────────────────────────────────────────────

async function runTest() {
  const browser = await chromium.launch({ headless: true });
  let passed = 0;
  let failed = 0;

  function assert(condition, msg) {
    if (condition) {
      console.log(`  PASS: ${msg}`);
      passed++;
    } else {
      console.error(`  FAIL: ${msg}`);
      failed++;
    }
  }

  try {
    // ── Test 1: Sign in, color cells, verify push ────────────────────────
    console.log("\n--- Test 1: Color cells and push to cloud ---");
    const ctx1 = await browser.newContext();
    const page1 = await ctx1.newPage();
    await page1.goto(BASE);
    await page1.waitForLoadState("networkidle");
    await signIn(page1);
    await sleep(2000);

    const beforeCount = await countColoredCells(page1);
    console.log(`  Colored cells before: ${beforeCount}`);

    // Color 3 cells far into the grid (unlikely to be already colored)
    const testIndices = [250, 251, 252];
    for (const idx of testIndices) {
      await clickDayCell(page1, idx);
      await sleep(300);
    }

    await sleep(2000); // wait for debounce + push

    const afterCount = await countColoredCells(page1);
    console.log(`  Colored cells after: ${afterCount}`);
    assert(afterCount >= beforeCount + 3, `At least 3 new cells colored (${afterCount - beforeCount} new)`);

    await ctx1.close();

    // ── Test 2: Fresh browser, clear localStorage, verify pull ───────────
    console.log("\n--- Test 2: Fresh session + clear localStorage → cloud pull ---");
    const ctx2 = await browser.newContext();
    const page2 = await ctx2.newPage();
    await page2.goto(BASE);
    await page2.waitForLoadState("networkidle");

    await page2.evaluate(() => localStorage.clear());
    await page2.reload();
    await page2.waitForLoadState("networkidle");

    await signIn(page2);
    await sleep(3000);

    const pulledCount = await countColoredCells(page2);
    console.log(`  Colored cells after cloud pull: ${pulledCount}`);
    assert(pulledCount >= 3, `Cloud data restored (${pulledCount} cells)`);

    await ctx2.close();

    // ── Test 3: Realtime sync between two tabs ───────────────────────────
    console.log("\n--- Test 3: Realtime sync between two tabs ---");
    const ctx3a = await browser.newContext();
    const ctx3b = await browser.newContext();
    const pageA = await ctx3a.newPage();
    const pageB = await ctx3b.newPage();

    await pageA.goto(BASE);
    await pageA.waitForLoadState("networkidle");
    await pageB.goto(BASE);
    await pageB.waitForLoadState("networkidle");

    await signIn(pageA);
    await signIn(pageB);
    await sleep(2000);

    const beforeA = await countColoredCells(pageA);
    const beforeB = await countColoredCells(pageB);
    console.log(`  Tab A colored: ${beforeA}, Tab B colored: ${beforeB}`);

    // Color a new cell on Tab A (use a cell far in the grid)
    await clickDayCell(pageA, 260);
    console.log("  Colored cell #20 on Tab A");

    // Wait for push + Realtime propagation
    await sleep(5000);

    const afterA = await countColoredCells(pageA);
    const afterB = await countColoredCells(pageB);
    console.log(`  Tab A colored: ${afterA}, Tab B colored: ${afterB}`);

    assert(afterB > beforeB, `Realtime: Tab B got new cell (${beforeB} → ${afterB})`);
    assert(afterA >= beforeA + 1, `No echo: Tab A still has new cell (${beforeA} → ${afterA})`);

    await ctx3a.close();
    await ctx3b.close();

    // ── Test 4: Empty localStorage does not overwrite cloud ──────────────
    console.log("\n--- Test 4: Empty localStorage must NOT overwrite cloud ---");
    const ctx4 = await browser.newContext();
    const page4 = await ctx4.newPage();
    await page4.goto(BASE);
    await page4.waitForLoadState("networkidle");

    await page4.evaluate(() => localStorage.clear());
    await page4.reload();
    await page4.waitForLoadState("networkidle");

    await signIn(page4);
    await sleep(3000);

    const restoredCount = await countColoredCells(page4);
    console.log(`  Colored cells after fresh login: ${restoredCount}`);
    assert(restoredCount > 0, `Cloud data NOT overwritten (${restoredCount} cells)`);

    await ctx4.close();

    // ── Cleanup: toggle test cells off ───────────────────────────────────
    console.log("\n--- Cleanup ---");
    const ctx5 = await browser.newContext();
    const page5 = await ctx5.newPage();
    await page5.goto(BASE);
    await page5.waitForLoadState("networkidle");
    await signIn(page5);
    await sleep(2000);

    for (const idx of [...testIndices, 260]) {
      await clickDayCell(page5, idx);
      await sleep(300);
    }
    await sleep(2000);
    console.log("  Cleaned up test cells");
    await ctx5.close();

  } catch (err) {
    console.error("E2E error:", err.message || err);
    failed++;
  } finally {
    await browser.close();
    console.log(`\n========================================`);
    console.log(`E2E: ${passed} passed, ${failed} failed`);
    console.log(`========================================\n`);
    process.exit(failed > 0 ? 1 : 0);
  }
}

runTest();
