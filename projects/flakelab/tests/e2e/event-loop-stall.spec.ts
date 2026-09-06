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

test("bounded event-loop stall exposes startup pressure and is fully removed", async ({ page }) => {
  const removeFaults = await installFaults(page, [{
    kind: "event-loop-stall",
    pattern: "**/event-loop",
    startAfterMs: 0,
    durationMs: 400,
  }])

  await page.goto(`${checkout.url}/event-loop`)
  await expect(page.getByRole("status")).toHaveText("Main thread missed deadline")

  await removeFaults()
  await page.goto(`${checkout.url}/event-loop`)
  await expect(page.getByRole("status")).toHaveText("Interactive")
})
