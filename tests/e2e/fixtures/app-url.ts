/**
 * Where the suite expects the app to be answering.
 *
 * A function rather than a constant because `playwright.config.ts` imports this
 * module, and an import's body runs before the importing module's body — so a
 * constant would be frozen at whatever `E2E_BASE_URL` was *before* the config
 * loaded `.env.local`. Reading it on call keeps one definition of the address
 * without that ordering trap.
 */
export function appBaseUrl(): string {
  return process.env.E2E_BASE_URL ?? "http://localhost:3000";
}
