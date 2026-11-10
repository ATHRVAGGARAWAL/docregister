import assert from "node:assert/strict";
import { test } from "node:test";
import { isSameOriginRequest } from "../../src/lib/auth/same-origin.ts";

test("clinic setup accepts the browser's host when Next binds a different local host", () => {
  const request = new Request("http://127.0.0.1:3100/api/auth/clinic", {
    headers: { host: "docregister.localhost:3100", origin: "http://docregister.localhost:3100" },
  });
  assert.equal(isSameOriginRequest(request), true);
});

test("clinic setup rejects a different origin, port, or protocol", () => {
  for (const origin of ["https://attacker.example", "http://docregister.localhost:3000", "https://docregister.localhost:3100", "null", "http://127.0.0.1:3100"]) {
    const request = new Request("http://127.0.0.1:3100/api/auth/clinic", {
      headers: { host: "docregister.localhost:3100", origin },
    });
    assert.equal(isSameOriginRequest(request), false, origin);
  }
});
