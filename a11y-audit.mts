/* THROWAWAY a11y audit harness. Deleted before this task finishes. */
import { readFileSync } from "node:fs";
import { chromium, type Page } from "playwright";
import nextEnv from "@next/env";

nextEnv.loadEnvConfig(process.cwd());

const { mintDoctorSession } = await import("./tests/e2e/fixtures/supabase-session.ts");
const { WORKSPACES } = await import("./tests/e2e/fixtures/workspaces.ts");

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const AXE = readFileSync("node_modules/axe-core/axe.min.js", "utf8");
const PROBE = readFileSync("a11y-probe.js", "utf8");

const AXE_SRC = `window.axe.run(document, {
  runOnly: { type: "tag", values: ["wcag2a","wcag2aa","wcag21a","wcag21aa","wcag22aa","best-practice"] },
  resultTypes: ["violations"]
}).then(function (r) {
  return r.violations.map(function (v) {
    return {
      id: v.id, impact: v.impact, help: v.help, count: v.nodes.length,
      nodes: v.nodes.slice(0, 5).map(function (n) {
        return { target: n.target.join(" "), summary: String(n.failureSummary || "").replace(/\\s+/g, " ").slice(0, 240) };
      })
    };
  });
})`;

const VIEWPORTS = [
  { name: "393x852", width: 393, height: 852 },
  { name: "1440x900", width: 1440, height: 900 },
];

async function audit(page: Page) {
  await page.addScriptTag({ content: AXE });
  const axe = (await page.evaluate(AXE_SRC)) as unknown[];
  const probe = (await page.evaluate(PROBE)) as Record<string, unknown>;
  return { axe, probe };
}

const storage = await mintDoctorSession(BASE);
const browser = await chromium.launch();
const out: string[] = [];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    storageState: storage,
    viewport: { width: vp.width, height: vp.height },
    timezoneId: "Asia/Kolkata",
    locale: "en-IN",
  });
  const page = await ctx.newPage();

  for (const ws of WORKSPACES) {
    await page.goto(`${BASE}/?view=${ws.view}`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(700);
    out.push(JSON.stringify({ vp: vp.name, view: ws.view, ...(await audit(page)) }));
  }

  if (vp.width < 1024) {
    await page.goto(`${BASE}/?view=overview`, { waitUntil: "domcontentloaded" });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.getByRole("button", { name: "Open workspace menu" }).click();
    await page.waitForTimeout(600);
    out.push(JSON.stringify({ vp: vp.name, view: "overview[sheet-open]", ...(await audit(page)) }));
  }

  await ctx.close();
}

await browser.close();
console.log(out.join("\n"));
