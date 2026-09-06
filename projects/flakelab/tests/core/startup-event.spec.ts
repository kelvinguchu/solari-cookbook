import { expect, test } from "@playwright/test"

import {
  documentBootstrapScript,
  injectDocumentBootstrap,
} from "../../src/faults/document-bootstrap.js"

test("startup bootstrap composes event delays and preserves a CSP nonce", () => {
  const source = documentBootstrapScript([
    { kind: "startup-event-delay", pattern: "**/app", event: "dom-content-loaded", delayMs: 75 },
    { kind: "startup-event-delay", pattern: "**/app", event: "dom-content-loaded", delayMs: 50 },
    { kind: "startup-event-delay", pattern: "**/app", event: "load", delayMs: 25 },
    { kind: "event-loop-stall", pattern: "**/app", startAfterMs: 10, durationMs: 50 },
    {
      kind: "storage-state-delay",
      pattern: "**/app",
      storage: "local-storage",
      key: "auth-token",
      delayMs: 200,
    },
  ])
  const html = Buffer.from(
    '<!doctype html><html><head><meta charset="utf-8"><script nonce="safe&<token"></script></head></html>',
  )
  const injected = injectDocumentBootstrap(html, "/.well-known/flakelab/bootstrap.js").toString()

  expect(source).toContain('trap(document, "DOMContentLoaded", 125)')
  expect(source).toContain('trap(window, "load", 25)')
  expect(source).toContain('}, 10)')
  expect(source).toContain("performance.now() + 50")
  expect(source).toContain('storage: "localStorage"')
  expect(source).toContain('key: "auth-token"')
  expect(source).toContain("performance.now() + 200")
  expect(injected).toContain(
    '<script src="/.well-known/flakelab/bootstrap.js" nonce="safe&amp;&lt;token"></script>',
  )
  expect(injected.indexOf("bootstrap.js")).toBeLessThan(injected.indexOf("<meta"))
})

test("startup bootstrap refuses to mutate a document without a head", () => {
  expect(() => injectDocumentBootstrap(
    Buffer.from("<!doctype html><html><body>App</body></html>"),
    "/bootstrap.js",
  )).toThrow(/head element/u)
})
