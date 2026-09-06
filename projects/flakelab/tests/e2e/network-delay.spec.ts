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

test("checkout succeeds without an injected network fault", async ({ page }) => {
  await page.goto(checkout.url)
  await page.getByRole("button", { name: "Place order" }).click()
  await expect(page.getByRole("status")).toHaveText("Checkout complete")
})

test("network delay reproduces the checkout timeout", async ({ page }) => {
  const removeFault = await installFaults(page, [{
    kind: "network-delay",
    pattern: "**/api/checkout",
    delayMs: 250,
  }])
  try {
    await page.goto(checkout.url)
    await page.getByRole("button", { name: "Place order" }).click()
    await expect(page.getByRole("status")).toHaveText("Checkout timed out")
  } finally {
    await removeFault()
  }

  await page.goto(checkout.url)
  await page.getByRole("button", { name: "Place order" }).click()
  await expect(page.getByRole("status")).toHaveText("Checkout complete")
})
