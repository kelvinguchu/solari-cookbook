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

test("DOMContentLoaded delay exposes late hydration and is fully removed", async ({ page }) => {
  const removeFaults = await installFaults(page, [{
    kind: "startup-event-delay",
    pattern: "**/hydration",
    event: "dom-content-loaded",
    delayMs: 750,
  }])

  await page.goto(`${checkout.url}/hydration`)
  await expect(page.getByRole("status")).toHaveText("Hydration missed deadline")

  await removeFaults()
  await page.goto(`${checkout.url}/hydration`)
  await expect(page.getByRole("status")).toHaveText("Hydrated")
})

test("load delay postpones only application load listeners", async ({ page }) => {
  const removeFaults = await installFaults(page, [{
    kind: "startup-event-delay",
    pattern: "**/load-hydration",
    event: "load",
    delayMs: 750,
  }])

  await page.goto(`${checkout.url}/load-hydration`)
  await expect(page.getByRole("status")).toHaveText("Load startup missed deadline")

  await removeFaults()
  await page.goto(`${checkout.url}/load-hydration`)
  await expect(page.getByRole("status")).toHaveText("Loaded")
})
