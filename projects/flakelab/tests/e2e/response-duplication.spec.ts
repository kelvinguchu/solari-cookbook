import { expect, test } from "@playwright/test"

import { installFaults } from "../../src/faults/install.js"
import type { CheckoutServer } from "../support/checkout-server.js"
import { startCheckoutServer } from "../support/checkout-server.js"

let checkout: CheckoutServer

test.beforeAll(async () => {
  checkout = await startCheckoutServer()
})

test.afterAll(async () => {
  await checkout.close()
})

test("response duplication is exact, ordered, and fully removed", async ({ page }) => {
  await page.goto(checkout.url)
  const removeDuplication = await installFaults(page, [{
    kind: "response-duplication",
    pattern: "**/api/checkout",
    duplicateBytes: 1,
  }])
  const duplicated = await page.evaluate(async (): Promise<string> => {
    const response = await fetch("/api/checkout", { method: "POST" })
    return response.text()
  })
  expect(duplicated).toBe('{"ok":true}}')
  await removeDuplication()

  const removeComposition = await installFaults(page, [
    {
      kind: "response-duplication",
      pattern: "**/api/checkout",
      duplicateBytes: 1,
    },
    {
      kind: "response-truncation",
      pattern: "**/api/checkout",
      removeBytes: 2,
    },
  ])

  const mutated = await page.evaluate(async (): Promise<string> => {
    const response = await fetch("/api/checkout", { method: "POST" })
    return response.text()
  })
  expect(mutated).toBe('{"ok":true')

  await removeComposition()
  const restored = await page.evaluate(async (): Promise<string> => {
    const response = await fetch("/api/checkout", { method: "POST" })
    return response.text()
  })
  expect(restored).toBe('{"ok":true}')
})
