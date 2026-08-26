import assert from "node:assert/strict";
import { test } from "node:test";

import { sttHealthResponse } from "../../server/stt-health.ts";
import { GET as webHealth } from "../../src/app/api/health/route.ts";

const configuredStt = {
  supabaseUrl: "https://project.supabase.co",
  supabaseKey: "publishable-key",
  elevenLabsKey: "elevenlabs-key",
  provider: "elevenlabs",
};

test("the web health endpoint is public, fresh and metadata-minimal", async () => {
  const response = webHealth();
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(Object.keys(body).sort(), ["checkedAt", "status"]);
  assert.equal(body.status, "ok");
  assert.equal(Number.isNaN(Date.parse(String(body.checkedAt))), false);
});

test("the STT health endpoint reports a configured production proxy as ready", () => {
  const response = sttHealthResponse({
    method: "GET",
    requestUrl: "/healthz?probe=1",
    config: configuredStt,
    now: new Date("2026-08-26T12:00:00.000Z"),
  });

  assert.ok(response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.deepEqual(JSON.parse(response.body), {
    status: "ok",
    configured: true,
    checkedAt: "2026-08-26T12:00:00.000Z",
  });
  assert.equal(response.body.includes("elevenlabs-key"), false);
  assert.equal(response.body.includes("publishable-key"), false);
});

test("the STT health endpoint fails readiness when a required key is missing", () => {
  const response = sttHealthResponse({
    method: "GET",
    requestUrl: "/healthz",
    config: { ...configuredStt, elevenLabsKey: "" },
  });

  assert.ok(response);
  assert.equal(response.statusCode, 503);
  assert.equal(JSON.parse(response.body).configured, false);
});

test("explicit mock mode is healthy without an ElevenLabs key", () => {
  const response = sttHealthResponse({
    method: "GET",
    requestUrl: "/healthz",
    config: {
      ...configuredStt,
      elevenLabsKey: "",
      provider: "mock",
      allowMock: true,
    },
  });

  assert.ok(response);
  assert.equal(response.statusCode, 200);
});

test("mock mode cannot make a production proxy look ready", () => {
  const response = sttHealthResponse({
    method: "GET",
    requestUrl: "/healthz",
    config: { ...configuredStt, elevenLabsKey: "", provider: "mock" },
  });

  assert.ok(response);
  assert.equal(response.statusCode, 503);
});

test("the STT health router supports HEAD and rejects other methods", () => {
  const head = sttHealthResponse({
    method: "HEAD",
    requestUrl: "/healthz",
    config: configuredStt,
  });
  const post = sttHealthResponse({
    method: "POST",
    requestUrl: "/healthz",
    config: configuredStt,
  });

  assert.ok(head);
  assert.equal(head.statusCode, 200);
  assert.equal(head.body, "");
  assert.ok(post);
  assert.equal(post.statusCode, 405);
  assert.equal(post.headers.Allow, "GET, HEAD");
});

test("the STT health router leaves non-health paths to the main server", () => {
  assert.equal(
    sttHealthResponse({
      method: "GET",
      requestUrl: "/",
      config: configuredStt,
    }),
    null,
  );
});
