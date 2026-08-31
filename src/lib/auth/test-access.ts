import { createHash, timingSafeEqual } from "node:crypto";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeTestEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (email.length === 0 || email.length > 254 || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

export function testEmailAllowlist(value: string | undefined): Set<string> {
  return new Set(
    (value ?? "")
      .split(",")
      .map((email) => normalizeTestEmail(email))
      .filter((email): email is string => email !== null),
  );
}

/**
 * Constant-time comparison keeps the production test code from leaking one
 * character at a time through response timing. Hashing first also gives both
 * buffers a fixed length, regardless of the submitted value.
 */
export function matchesTestAccessCode(value: unknown, expected: string | undefined): boolean {
  if (typeof value !== "string" || !expected || expected.length < 24 || value.length > 256) {
    return false;
  }

  const submittedHash = createHash("sha256").update(value).digest();
  const expectedHash = createHash("sha256").update(expected).digest();
  return timingSafeEqual(submittedHash, expectedHash);
}
