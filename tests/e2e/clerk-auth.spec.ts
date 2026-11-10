import { clerk, clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { createClerkClient } from "@clerk/backend";
import { test, expect } from "playwright/test";
import { WebSocket } from "ws";
import { authRequirement } from "./fixtures/clerk-session";

const available = authRequirement();
test.skip(!available.ready, available.reason);
test.beforeAll(async () => {
  await clerkSetup({ publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, dotenv: false });
});

test("signed-out users see Clerk controls and cannot access clinical APIs", async ({ page, request }) => {
  await setupClerkTestingToken({ page });
  await page.goto("/sign-in");
  await expect(page.locator(".cl-signIn-root")).toBeVisible();
  await expect(page.getByRole("link", { name: "Create account", exact: true })).toBeVisible();
  await expect(page.getByLabel("Testing access code")).toHaveCount(0);
  const denied = await request.get("/api/patients");
  expect(denied.status()).toBe(401);
  expect(await denied.json()).toHaveProperty("error");
  expect((await request.post("/api/auth/clinic", { data: { fullName: "Guest", clinicName: "Private clinic" } })).status()).toBe(401);
  expect((await request.post("/api/auth/test-login", { data: { email: "doctor@example.com", accessCode: "retired-code" } })).status()).toBe(410);
});

test("a failed Clerk script shows a retry action instead of a blank panel", async ({ page }) => {
  await page.route(/clerk\.browser\.js/, route => route.abort());
  await page.goto("/sign-in");
  await expect(page.getByRole("status")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try sign-in again" })).toBeVisible({ timeout: 15_000 });
});

test("an interrupted Google callback recovers to the sign-in form", async ({ page }) => {
  await setupClerkTestingToken({ page });
  await page.goto("/sign-in/sso-callback");
  await expect(page.getByRole("heading", { name: "Sign in to docregister", exact: true })).toBeVisible();
});

test("a new Clerk account can create a clinic and sign out", async ({ page }) => {
  const email = `signup+clerk_test_${Date.now()}@example.com`;
  const admin = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  await setupClerkTestingToken({ page });
  try {
    await page.goto("/sign-up");
    await expect(page.locator(".cl-signUp-root")).toBeVisible();
    for (const [field, value] of [["firstName", "Demo"], ["lastName", "Doctor"]]) {
      const input = page.locator(`input[name="${field}"]`);
      if (await input.isVisible()) await input.fill(value);
    }
    await page.locator('input[name="emailAddress"]').fill(email);
    await page.locator('input[name="password"]').fill("Clinic-demo-testing-2026!9");
    await page.getByRole("button", { name: "Continue", exact: true }).click();
    const otp = page.getByRole("textbox", { name: "Enter verification code" });
    await expect(otp).toBeVisible();
    await otp.pressSequentially("424242");
    await page.waitForURL("**/onboarding");
    await page.getByLabel("Your name").fill("Dr. Demo Doctor");
    await page.getByLabel("Clinic name").fill(`Clerk signup test ${Date.now()}`);
    await page.getByRole("button", { name: "Continue to workspace" }).click();
    await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
    await expect(page.locator(".cl-userButtonTrigger").first()).toBeVisible();
    await page.locator(".clinical-sidebar").getByRole("button", { name: "Sign out", exact: true }).click();
    await page.waitForURL("**/sign-in");
    expect((await page.request.get("/api/patients")).status()).toBe(401);
  } finally {
    const users = await admin.users.getUserList({ emailAddress: [email] });
    for (const user of users.data) await admin.users.deleteUser(user.id);
  }
});

test("existing Clerk doctors keep their workspace after reload", async ({ page }) => {
  await setupClerkTestingToken({ page });
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: process.env.E2E_DOCTOR_EMAIL! });
  await page.waitForURL(url => url.pathname === "/");
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
  expect((await page.request.get("/api/register")).status()).toBe(200);
});

test("account controls hydrate after signed-in reloads on desktop and mobile", async ({ page }) => {
  const hydrationErrors: string[] = [];
  const record = (message: string) => {
    if (/hydration|hydrated|server rendered HTML/i.test(message)) hydrationErrors.push(message);
  };
  page.on("pageerror", error => record(error.message));
  page.on("console", message => {
    if (message.type() === "error") record(message.text());
  });
  await setupClerkTestingToken({ page });
  await page.goto("/sign-in");
  await clerk.signIn({ page, emailAddress: process.env.E2E_DOCTOR_EMAIL! });
  await page.waitForURL(url => url.pathname === "/");

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/?view=treatments");
    const accountButton = page.locator(".cl-userButtonTrigger").filter({ visible: true });
    await expect(accountButton).toBeVisible();
    await page.reload();
    await expect(accountButton).toBeVisible();
    await accountButton.click();
    await expect(page.locator(".cl-userButtonPopoverCard")).toBeVisible();
    await page.keyboard.press("Escape");
  }
  expect(hydrationErrors).toEqual([]);
});

test("joining an existing clinic requires approval before clinical access", async ({ page }) => {
  test.setTimeout(90_000);
  const suffix = Date.now();
  const admin = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });
  const userIds: string[] = [];
  const clinicName = `Approval test ${suffix}`;
  await setupClerkTestingToken({ page });
  try {
    for (const member of ["owner", "pending"]) {
      const email = `${member}+clerk_test_${suffix}@example.com`;
      const user = await admin.users.createUser({
        emailAddress: [email], skipPasswordRequirement: true,
      });
      userIds.push(user.id);
      await page.goto("/sign-in");
      await clerk.signIn({ page, emailAddress: email });
      await page.waitForURL("**/onboarding");
      await page.getByLabel("Your name").fill(`Dr. ${member}`);
      await page.getByLabel("Clinic name").fill(clinicName);
      await page.getByRole("button", { name: "Continue to workspace" }).click();
      if (member === "owner") {
        await expect(page.getByRole("heading", { name: "Today", exact: true })).toBeVisible();
        await clerk.signOut({ page });
        continue;
      }
      await expect(page.getByRole("heading", { name: "Waiting for approval" })).toBeVisible();
      expect((await page.request.get("/api/patients")).status()).toBe(403);
      expect((await page.request.post("/api/encounters/extract", {
        data: { text: "Patient Test, fever for three days.", treatAs: "dictation" },
      })).status()).toBe(403);

      // The separate voice process is optional in web-only CI runs.
      if (process.env.E2E_STT_URL) {
        const token = await page.evaluate(async () => {
          const client = (window as unknown as { Clerk: { session: { getToken(): Promise<string> } } }).Clerk;
          return client.session.getToken();
        });
        const closeCode = await new Promise<number>((resolve, reject) => {
          const socket = new WebSocket(process.env.E2E_STT_URL!);
          const timer = setTimeout(() => {
            socket.terminate();
            reject(new Error("Pending member's voice connection did not close."));
          }, 10_000);
          socket.on("open", () => socket.send(JSON.stringify({ type: "start", token })));
          socket.on("message", () => {
            clearTimeout(timer);
            socket.terminate();
            reject(new Error("A pending member received transcription."));
          });
          socket.on("close", code => { clearTimeout(timer); resolve(code); });
          socket.on("error", error => { clearTimeout(timer); reject(error); });
        });
        expect(closeCode).toBe(4403);
      }
    }
  } finally {
    for (const userId of userIds) await admin.users.deleteUser(userId);
  }
});
