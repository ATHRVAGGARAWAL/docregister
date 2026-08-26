import assert from "node:assert/strict";
import { WebSocket } from "ws";

const appUrl = withoutTrailingSlash(
  process.env.DOCREGISTER_APP_URL ?? "https://docregister.athrv.dev",
);
const sttUrl = withoutTrailingSlash(
  process.env.DOCREGISTER_STT_URL ??
    "https://docregister-production.up.railway.app",
);

const checks = [
  ["web health", checkWebHealth],
  ["signed-out redirect", checkSignedOutRedirect],
  ["login page and security headers", checkLoginPage],
  ["API authentication boundary", checkAuthenticationBoundary],
  ["STT readiness", checkSttHealth],
  ["STT HEAD readiness", checkSttHead],
  ["STT WebSocket upgrade", checkSttWebSocket],
];

let failed = 0;

for (const [name, check] of checks) {
  try {
    await check();
    console.log(`✓ ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`✗ ${name}: ${error instanceof Error ? error.message : error}`);
  }
}

if (failed > 0) {
  console.error(`Production smoke failed: ${failed}/${checks.length} checks failed.`);
  process.exitCode = 1;
} else {
  console.log(`Production smoke passed: ${checks.length}/${checks.length} checks.`);
}

async function checkWebHealth() {
  const response = await get(`${appUrl}/api/health`);
  assert.equal(response.status, 200);
  assertJson(response);
  assertNoStore(response);
  assertSecurityHeaders(response);

  const body = await response.json();
  assert.equal(body.status, "ok");
  assert.equal(Number.isNaN(Date.parse(body.checkedAt)), false);
  assert.deepEqual(Object.keys(body).sort(), ["checkedAt", "status"]);
}

async function checkSignedOutRedirect() {
  const response = await get(`${appUrl}/`, { redirect: "manual" });
  assert.ok([302, 303, 307, 308].includes(response.status));
  const destination = new URL(requiredHeader(response, "location"), appUrl);
  assert.equal(destination.origin, new URL(appUrl).origin);
  assert.equal(destination.pathname, "/login");
}

async function checkLoginPage() {
  const response = await get(`${appUrl}/login`);
  assert.equal(response.status, 200);
  assert.match(requiredHeader(response, "content-type"), /^text\/html\b/);
  assertSecurityHeaders(response);
  assert.equal(response.headers.has("x-powered-by"), false);

  const html = await response.text();
  assert.match(html, /DocRegister/i);
}

async function checkAuthenticationBoundary() {
  const response = await get(`${appUrl}/api/patients`);
  assert.equal(response.status, 401);
  assertJson(response);
  assertSecurityHeaders(response);

  const body = await response.json();
  assert.equal(typeof body.error, "string");
  assert.ok(body.error.length > 0);
}

async function checkSttHealth() {
  const response = await get(`${sttUrl}/healthz`);
  assert.equal(response.status, 200);
  assertJson(response);
  assertNoStore(response);
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");

  const body = await response.json();
  assert.equal(body.status, "ok");
  assert.equal(body.configured, true);
  assert.equal(Number.isNaN(Date.parse(body.checkedAt)), false);
  assert.deepEqual(Object.keys(body).sort(), ["checkedAt", "configured", "status"]);
}

async function checkSttHead() {
  const response = await get(`${sttUrl}/healthz`, { method: "HEAD" });
  assert.equal(response.status, 200);
  assertNoStore(response);
  assert.equal(await response.text(), "");
}

async function checkSttWebSocket() {
  const url = new URL(sttUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

  await new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    let opened = false;
    const timeout = setTimeout(() => {
      socket.terminate();
      reject(new Error(`WebSocket upgrade timed out for ${url.origin}`));
    }, 15_000);

    socket.once("open", () => {
      opened = true;
      socket.close(1000, "production smoke complete");
    });
    socket.once("close", () => {
      clearTimeout(timeout);
      if (opened) resolve();
      else reject(new Error(`WebSocket closed before opening for ${url.origin}`));
    });
    socket.once("unexpected-response", (_request, response) => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket upgrade returned HTTP ${response.statusCode}`));
    });
    socket.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function get(url, init = {}) {
  let lastError;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          "User-Agent": "DocRegister-Production-Smoke/1.0",
          ...init.headers,
        },
        signal: AbortSignal.timeout(15_000),
      });

      if (response.status < 500 || attempt === 3) return response;
      await response.body?.cancel();
    } catch (error) {
      lastError = error;
      if (attempt === 3) throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, attempt * 500));
  }

  throw lastError ?? new Error(`Could not reach ${url}`);
}

function assertJson(response) {
  assert.match(requiredHeader(response, "content-type"), /^application\/json\b/);
}

function assertNoStore(response) {
  assert.match(requiredHeader(response, "cache-control"), /\bno-store\b/i);
}

function assertSecurityHeaders(response) {
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.match(requiredHeader(response, "strict-transport-security"), /max-age=/i);
  assert.match(requiredHeader(response, "content-security-policy"), /default-src 'self'/);
}

function requiredHeader(response, name) {
  const value = response.headers.get(name);
  assert.ok(value, `${response.url || "response"} is missing ${name}`);
  return value;
}

function withoutTrailingSlash(value) {
  return value.replace(/\/+$/, "");
}
