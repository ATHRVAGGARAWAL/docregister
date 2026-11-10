import { clerk, clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import type { Browser, PlaywrightTestOptions } from "playwright/test";

export type StorageState = Exclude<PlaywrightTestOptions["storageState"], undefined | string>;

export function authRequirement(): { ready: boolean; reason: string } {
  const required = ["NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "CLERK_SECRET_KEY", "E2E_DOCTOR_EMAIL"];
  const missing = required.filter(name => !process.env[name]);
  const development = process.env.CLERK_SECRET_KEY?.startsWith("sk_test_");
  return {
    ready: missing.length === 0 && Boolean(development),
    reason: missing.length ? `Clerk workspace tests need ${missing.join(", ")}.` :
      development ? "" : "Workspace tests require a Clerk development instance.",
  };
}

/** A real Clerk session, isolated to the designated development test doctor. */
export async function mintDoctorSession(baseUrl: string, browser: Browser): Promise<StorageState> {
  if (!authRequirement().ready) throw new Error(authRequirement().reason);
  await clerkSetup({ publishableKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, dotenv: false });
  const context = await browser.newContext();
  try {
    const page = await context.newPage();
    await setupClerkTestingToken({ page });
    await page.goto(`${baseUrl.replace(/\/$/, "")}/sign-in`);
    await clerk.signIn({ page, emailAddress: process.env.E2E_DOCTOR_EMAIL! });
    await page.waitForURL(url => url.pathname === "/");
    await page.getByRole("heading", { name: "Today", exact: true }).waitFor();
    return await context.storageState();
  } finally {
    await context.close();
  }
}
