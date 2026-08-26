import type { Page, Response } from "playwright/test";

import { authRequirement, expect, test as signedIn } from "./fixtures/signed-in";
import type { AccountEntry, AccountsPayload } from "@/lib/types";

/**
 * The ledger, checked against the numbers the page was actually sent.
 *
 * Nothing here compares the screen to a second request the test made: the
 * doctor may be adding entries while this runs, and a total computed over a
 * different set of rows than the list beneath it is exactly the defect worth
 * catching — it looks entirely plausible on screen. These four figures are what
 * the practice reconciles cash against at the end of a day.
 *
 * The split is deliberate. Tests that ask "did the server answer consistently"
 * run against the real ledger. Tests that ask "does the workspace draw what it
 * was given" run against a stub, because the live register is a doctor's books:
 * the tests may not add an expense to prove the expense filter works, and a
 * spec that skips itself whenever this month happened to be all income is a
 * spec that stops covering anything.
 */

const auth = authRequirement();

/**
 * Read-only, and enforced rather than merely intended.
 *
 * A stray click on "Mark paid" or a submitted entry sheet would leave a row
 * behind in a real practice's books and still let the test pass, so any non-GET
 * call to /api fails the test that made it. Nothing the dashboard does
 * unprompted is a write — drafts are only discarded or restored by an explicit
 * click — so this stays silent unless a test misbehaves.
 */
const test = signedIn.extend<{ readOnlyLedger: void }>({
  readOnlyLedger: [
    async ({ page }, use) => {
      const writes: string[] = [];
      page.on("request", (request) => {
        const { pathname } = new URL(request.url());
        if (pathname.startsWith("/api/") && request.method() !== "GET") {
          writes.push(`${request.method()} ${pathname}`);
        }
      });
      await use();
      expect(writes, "this spec must never write to a live ledger").toEqual([]);
    },
    { auto: true },
  ],
});

test.skip(!auth.ready, auth.reason);

/** The workspace's own request for ledger data, whatever filters produced it. */
function ledgerResponse(page: Page): Promise<Response> {
  return page.waitForResponse((response) => new URL(response.url()).pathname === "/api/accounts");
}

async function payloadOf(response: Response): Promise<AccountsPayload> {
  expect(response.status(), (await response.text()).slice(0, 200)).toBe(200);
  return (await response.json()) as AccountsPayload;
}

function ledgerRows(page: Page) {
  return page.getByRole("list", { name: "Account entries" }).getByRole("listitem");
}

/**
 * A summary figure, found by the hint under the number rather than the label
 * above it: "Received" is also a substring of the Net card's "Received minus
 * expenses", so the labels alone cannot tell those two cards apart.
 */
function summaryFigure(page: Page, hint: string) {
  return page
    .getByRole("list")
    .filter({ hasText: "Received minus expenses" })
    .getByRole("listitem")
    .filter({ hasText: hint })
    .locator(".tnum");
}

const CARDS = [
  { key: "received_paise", hint: "Paid income" },
  { key: "pending_paise", hint: "Still to collect" },
  { key: "expenses_paise", hint: "Paid expenses" },
  { key: "net_paise", hint: "Received minus expenses" },
] as const;

/**
 * Open the ledger and hand back exactly what the page was told.
 *
 * The waiter is armed before `goto` because the request leaves from an effect
 * on mount: a listener attached after `goto` resolves has already missed it on
 * a warm server.
 */
async function openLedger(page: Page): Promise<AccountsPayload> {
  const answered = ledgerResponse(page);
  await page.goto("/?view=accounts");
  const payload = await payloadOf(await answered);
  await expect(page.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible();
  await expect(page.getByText("Loading ledger…")).toBeHidden();
  return payload;
}

/**
 * The whole rupees a figure is showing.
 *
 * Money renders at `maximumFractionDigits: 0`, so the screen never carries the
 * paise the API sent. Parsing to a number keeps this spec about the figures
 * agreeing with each other, so a change to how rupees are punctuated does not
 * read as a wrong total — and the test runner's ICU need not match the
 * browser's.
 */
function parseRupees(text: string): number {
  const match = text.match(/(-|−)?\s*₹\s*(-|−)?\s*([\d,]+)/);
  expect(match, `no rupee figure in "${text}"`).not.toBeNull();
  const value = Number(match![3].replace(/,/g, ""));
  return match![1] || match![2] ? -value : value;
}

/** `Intl` rounds halves away from zero; `Math.round` only does so above it. */
function rupeesOf(paise: number): number {
  return Math.sign(paise) * Math.round(Math.abs(paise) / 100);
}

function sumPaise(entries: readonly AccountEntry[]): number {
  return entries.reduce((total, entry) => total + entry.amount_paise, 0);
}

/** Midnight IST of the first day a `days`-wide window covers, as an instant. */
function rangeStart(days: number): number {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const first = new Date(`${today}T00:00:00Z`);
  first.setUTCDate(first.getUTCDate() - (days - 1));
  return new Date(`${first.toISOString().slice(0, 10)}T00:00:00+05:30`).getTime();
}

/* ------------------------------------------------------------------ *
 * Against the real ledger.
 * ------------------------------------------------------------------ */

test("the ledger lists every entry the server sent, or says plainly there are none", async ({
  page,
}) => {
  const payload = await openLedger(page);

  if (payload.entries.length === 0) {
    // A quiet month is a legitimate answer, and it has to be distinguishable
    // from a ledger that never arrived.
    await expect(page.getByRole("heading", { name: "No account entries found" })).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
    return;
  }

  await expect(ledgerRows(page)).toHaveCount(payload.entries.length);

  // The list asks for at most 200, so it is a slice whenever the window holds
  // more. More rows than the server counted would mean the list is wrong.
  expect(payload.entries.length).toBeLessThanOrEqual(payload.totalCount);

  // One figure per row. Two would mean a doctor scanning the column is reading
  // an amount that belongs to a different entry.
  expect(await ledgerRows(page).locator(".tnum").count()).toBe(payload.entries.length);
});

test("the four totals are the ones the server computed", async ({ page }) => {
  const { summary } = await openLedger(page);

  for (const card of CARDS) {
    const shown = parseRupees(await summaryFigure(page, card.hint).innerText());
    expect(shown, `the "${card.hint}" figure disagrees with the summary the page was sent`).toBe(
      rupeesOf(summary[card.key]),
    );
  }

  // The Net card's own hint claims it is received minus expenses. Read off the
  // screen rather than the payload, because that sentence is what a doctor
  // trusts when the figure looks wrong.
  const received = parseRupees(await summaryFigure(page, "Paid income").innerText());
  const expenses = parseRupees(await summaryFigure(page, "Paid expenses").innerText());
  const net = parseRupees(await summaryFigure(page, "Received minus expenses").innerText());
  expect(net, "Net is labelled “Received minus expenses” and must be exactly that").toBe(
    received - expenses,
  );
});

test("the real totals are the real rows added up", async ({ page }) => {
  const payload = await openLedger(page);
  test.skip(payload.entries.length === 0, "an empty window has nothing to add up");
  test.skip(
    payload.entries.length !== payload.totalCount,
    "the window holds more entries than the list requests, so the rows are only a slice",
  );

  // The summary comes from a second database function over the same window as
  // the list. Nothing on screen would reveal those two drifting apart, which is
  // the entire reason this assertion exists.
  const of = (kind: string, status: string) =>
    sumPaise(payload.entries.filter((entry) => entry.kind === kind && entry.status === status));

  expect(payload.summary.received_paise, "Received is not the paid income on screen").toBe(
    of("income", "paid"),
  );
  expect(payload.summary.pending_paise, "Pending is not the unpaid income on screen").toBe(
    of("income", "pending"),
  );
  expect(payload.summary.expenses_paise, "Expenses is not the paid expenses on screen").toBe(
    of("expense", "paid"),
  );
  expect(payload.summary.net_paise).toBe(of("income", "paid") - of("expense", "paid"));

  expect(parseRupees(await summaryFigure(page, "Paid income").innerText())).toBe(
    rupeesOf(of("income", "paid")),
  );
});

test("every filter asks the server for exactly what it names", async ({ page }) => {
  await openLedger(page);

  // Each of these is a control whose label is a promise about the request
  // behind it. A tab that reads "Expenses" while sending `kind=income` shows a
  // full ledger under an empty-sounding heading, and nothing on screen says so.
  const steps = [
    { group: "Entry type", option: "Income", param: "kind", value: "income" },
    { group: "Entry type", option: "Expenses", param: "kind", value: "expense" },
    { group: "Payment status", option: "Pending", param: "status", value: "pending" },
    { group: "Payment status", option: "Paid", param: "status", value: "paid" },
    { group: "Accounts date range", option: "7D", param: "days", value: "7" },
    { group: "Accounts date range", option: "1Y", param: "days", value: "365" },
  ] as const;

  for (const step of steps) {
    const answered = ledgerResponse(page);
    await page
      .getByRole("group", { name: step.group })
      // Not an exact name: the type tabs carry a live count, so "Income" is
      // really "Income 12" in the accessibility tree.
      .getByRole("button", { name: step.option })
      .click();
    const asked = new URL((await answered).url()).searchParams;
    expect(asked.get(step.param), `"${step.option}" did not ask for ${step.param}`).toBe(step.value);
  }

  // "All" has to clear the narrowing rather than send `kind=all`, which the
  // route rejects as an unknown choice.
  const cleared = ledgerResponse(page);
  await page
    .getByRole("group", { name: "Entry type" })
    .getByRole("button", { name: "All", exact: false })
    .click();
  const asked = new URL((await cleared).url()).searchParams;
  expect(asked.get("kind")).toBeNull();
});

test("narrowing the range lists nothing from before that window", async ({ page }) => {
  await openLedger(page);

  const answered = ledgerResponse(page);
  await page
    .getByRole("group", { name: "Accounts date range" })
    .getByRole("button", { name: "7D" })
    .click();
  const week = await payloadOf(await answered);
  await expect(ledgerRows(page)).toHaveCount(week.entries.length);

  // The window is bounded at midnight in Mumbai, not in UTC. A boundary drawn
  // in the wrong zone moves five and a half hours of takings into or out of the
  // week the doctor is looking at.
  const earliest = rangeStart(7);
  expect(
    week.entries
      .filter((entry) => new Date(entry.occurred_at).getTime() < earliest)
      .map((entry) => `${entry.category} ${entry.occurred_at}`),
    "an entry from before the seven-day window was listed inside it",
  ).toEqual([]);
});

test("a ledger that fails to load says so in words a doctor can act on", async ({ page }) => {
  // 500 rather than 401: a 401 makes the dashboard tear the session down, which
  // is a different — and correct — behaviour from the one under test.
  await page.route(
    (url) => url.pathname === "/api/accounts",
    (route) =>
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "Could not load accounts." }),
      }),
  );

  await page.goto("/?view=accounts");
  await expect(page.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible();

  const alert = page.getByRole("alert").filter({ hasText: "Could not load accounts." });
  await expect(alert).toBeVisible();

  // Whatever else that alert says, it must not be a database or proxy string.
  // A doctor cannot act on "PGRST116", and a stack frame in a clinic is noise.
  expect(await alert.innerText()).not.toMatch(/PGRST|postgres|supabase|<!DOCTYPE|\bat \w+ \(/i);
});

test("the entry sheet refuses an incomplete entry and closes without saving", async ({ page }) => {
  await openLedger(page);

  const add = page.getByRole("button", { name: "Add entry" });
  await add.click();
  const sheet = page.getByRole("dialog").filter({ hasText: "Add account entry" });
  await expect(sheet).toBeVisible();

  // An amount with nothing to file it under is not a ledger row, and neither is
  // a category with no amount. Both guards are a disabled control rather than a
  // complaint after the fact, so the doctor never gets as far as believing an
  // entry was saved.
  const save = sheet.getByRole("button", { name: "Save entry" });
  const category = sheet.getByLabel("Category", { exact: true });
  await expect(save, "an entry with no amount is not a ledger row").toBeDisabled();
  await sheet.getByLabel("Amount", { exact: true }).fill("250");
  await category.fill("");
  await expect(save, "an amount with nothing to file it under is not a ledger row").toBeDisabled();
  await category.fill("Consultation");
  await expect(save).toBeEnabled();

  // Escape has to be enough. A modal a keyboard user can only leave by finding
  // the close button is a modal they are stuck in.
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(add).toBeVisible();

  // The `readOnlyLedger` fixture is what proves nothing was written; this is
  // only the half of it that is visible on screen.
  await expect(page.getByRole("heading", { name: "Accounts", exact: true })).toBeVisible();
});

/* ------------------------------------------------------------------ *
 * Against a stubbed ledger, so the shape of the data is known.
 * ------------------------------------------------------------------ */

function daysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

function fakeEntry(entry: Partial<AccountEntry> & Pick<AccountEntry, "id" | "kind" | "status" | "amount_paise" | "category">): AccountEntry {
  return {
    currency: "INR",
    payment_method: "cash",
    counterparty: null,
    note: null,
    patient_id: null,
    encounter_id: null,
    source: "manual",
    occurred_at: daysAgo(1),
    created_at: daysAgo(1),
    updated_at: daysAgo(1),
    ...entry,
  };
}

/**
 * Four entries chosen to make every rule visible at once: both kinds, both
 * statuses, an amount whose paise round up (₹900.50), and expenses large enough
 * that Net comes out negative — the only case where the minus sign in front of
 * a total is load-bearing. The oldest sits outside a seven-day window so
 * narrowing the range has something to remove.
 */
const SAMPLE: readonly AccountEntry[] = [
  fakeEntry({ id: "stub-1", kind: "income", status: "paid", amount_paise: 150_000, category: "Consultation", occurred_at: daysAgo(1) }),
  fakeEntry({ id: "stub-2", kind: "income", status: "pending", amount_paise: 90_050, category: "Procedure", occurred_at: daysAgo(2) }),
  fakeEntry({ id: "stub-3", kind: "expense", status: "paid", amount_paise: 220_000, category: "Supplies", occurred_at: daysAgo(3) }),
  fakeEntry({ id: "stub-4", kind: "expense", status: "paid", amount_paise: 45_000, category: "Utilities", occurred_at: daysAgo(20) }),
];

const within = (entries: readonly AccountEntry[], kind: string, status: string) =>
  sumPaise(entries.filter((entry) => entry.kind === kind && entry.status === status));

/**
 * Serve a known ledger, filtered the way the route filters it.
 *
 * The summary deliberately ignores `kind`, `status` and `q`: the API computes
 * it from a separate database function bounded by the date window alone, so a
 * stub that narrowed it too would assert behaviour the app does not have.
 */
async function stubLedger(page: Page, entries: readonly AccountEntry[] = SAMPLE) {
  await page.route(
    (url) => url.pathname === "/api/accounts",
    async (route) => {
      const asked = new URL(route.request().url()).searchParams;
      const inWindow = entries.filter(
        (entry) => new Date(entry.occurred_at).getTime() >= rangeStart(Number(asked.get("days")) || 30),
      );
      const kind = asked.get("kind");
      const status = asked.get("status");
      const query = (asked.get("q") ?? "").toLowerCase();
      const shown = inWindow.filter(
        (entry) =>
          (!kind || entry.kind === kind) &&
          (!status || entry.status === status) &&
          (!query || entry.category.toLowerCase().includes(query)),
      );
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          entries: shown,
          summary: {
            received_paise: within(inWindow, "income", "paid"),
            pending_paise: within(inWindow, "income", "pending"),
            expenses_paise: within(inWindow, "expense", "paid"),
            net_paise: within(inWindow, "income", "paid") - within(inWindow, "expense", "paid"),
          },
          totalCount: shown.length,
        } satisfies AccountsPayload),
      });
    },
  );
}

/** Click one segmented control and wait for the ledger it asked for. */
async function applyFilter(page: Page, group: string, option: string) {
  const answered = ledgerResponse(page);
  await page.getByRole("group", { name: group }).getByRole("button", { name: option }).click();
  await answered;
}

test("a known ledger draws both kinds, both statuses and a loss", async ({ page }) => {
  await stubLedger(page);
  await openLedger(page);

  await expect(ledgerRows(page)).toHaveCount(4);
  await expect(ledgerRows(page).getByText("Paid", { exact: true })).toHaveCount(3);
  await expect(ledgerRows(page).getByRole("button", { name: "Mark paid" })).toHaveCount(1);

  expect(parseRupees(await summaryFigure(page, "Paid income").innerText())).toBe(1_500);
  // ₹900.50 with no decimal place shown: `Intl` rounds a half away from zero,
  // so the doctor must see ₹901 rather than the ₹900 a truncation would give.
  expect(parseRupees(await summaryFigure(page, "Still to collect").innerText())).toBe(901);
  expect(parseRupees(await summaryFigure(page, "Paid expenses").innerText())).toBe(2_650);

  // A loss has to read as a loss. A total that drops the sign turns ₹1,150 out
  // of pocket into ₹1,150 in hand.
  const net = await summaryFigure(page, "Received minus expenses").innerText();
  expect(net, "a negative net lost its sign").toMatch(/[-−]/);
  expect(parseRupees(net)).toBe(-1_150);
});

test("the income filter leaves only money coming in", async ({ page }) => {
  await stubLedger(page);
  await openLedger(page);
  await applyFilter(page, "Entry type", "Income");

  await expect(ledgerRows(page)).toHaveCount(2);
  // Read off the screen, not the payload: the sign in front of an amount is the
  // only thing separating money in from money out at a glance.
  const amounts = await ledgerRows(page).locator(".tnum").allInnerTexts();
  expect(
    amounts.filter((amount) => !amount.trimStart().startsWith("+")),
    "an expense survived the income filter",
  ).toEqual([]);

  // The four figures are bounded by the date window, not by the tab, so they
  // must not move when the doctor narrows to one kind — otherwise "Expenses"
  // would read ₹0 while three expenses sat one tab away.
  expect(parseRupees(await summaryFigure(page, "Paid expenses").innerText())).toBe(2_650);
});

test("the expense filter leaves only money going out", async ({ page }) => {
  await stubLedger(page);
  await openLedger(page);
  await applyFilter(page, "Entry type", "Expenses");

  await expect(ledgerRows(page)).toHaveCount(2);
  const amounts = await ledgerRows(page).locator(".tnum").allInnerTexts();
  expect(
    amounts.filter((amount) => !amount.trimStart().startsWith("−")),
    "income survived the expense filter",
  ).toEqual([]);
});

test("the pending filter leaves only money still owed", async ({ page }) => {
  await stubLedger(page);
  await openLedger(page);
  await applyFilter(page, "Payment status", "Pending");

  // A settled entry shows a "Paid" badge; an outstanding one shows the control
  // that would settle it. Counting those controls — never clicking one — checks
  // the filter without touching the books.
  await expect(ledgerRows(page)).toHaveCount(1);
  await expect(ledgerRows(page).getByRole("button", { name: "Mark paid" })).toHaveCount(1);
  await expect(ledgerRows(page).getByText("Paid", { exact: true })).toHaveCount(0);
  await expect(ledgerRows(page).getByText("Procedure")).toBeVisible();
});

test("the counts on the type tabs describe the rows underneath them", async ({ page }) => {
  await stubLedger(page);
  await openLedger(page);

  // The badge is part of each button's accessible name, so the name is the
  // assertion: "Income 2" sitting above two income rows.
  const tabs = page.getByRole("group", { name: "Entry type" });
  await expect(tabs.getByRole("button", { name: "All" })).toHaveAccessibleName("All 4");
  await expect(tabs.getByRole("button", { name: "Income" })).toHaveAccessibleName("Income 2");
  await expect(tabs.getByRole("button", { name: "Expenses" })).toHaveAccessibleName("Expenses 2");
});

test("narrowing the range drops the older entry and the total it carried", async ({ page }) => {
  await stubLedger(page);
  await openLedger(page);
  await expect(ledgerRows(page)).toHaveCount(4);

  await applyFilter(page, "Accounts date range", "7D");

  // Both halves have to move together. A list that shortened while the totals
  // stayed put is the reading a doctor would take to the bank.
  await expect(ledgerRows(page)).toHaveCount(3);
  await expect(ledgerRows(page).getByText("Utilities")).toHaveCount(0);
  expect(parseRupees(await summaryFigure(page, "Paid expenses").innerText())).toBe(2_200);
  expect(parseRupees(await summaryFigure(page, "Received minus expenses").innerText())).toBe(-700);
});
