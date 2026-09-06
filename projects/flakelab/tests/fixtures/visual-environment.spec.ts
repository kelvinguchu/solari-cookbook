import { expect, test } from "@playwright/test"

import type { CheckoutServer } from "../support/checkout-server.js"
import { startCheckoutServer } from "../support/checkout-server.js"

let checkout: CheckoutServer

test.beforeAll(async () => {
  checkout = await startCheckoutServer()
})

test.afterAll(async () => {
  await checkout.close()
})

test.beforeEach(async ({ page }) => {
  await page.goto(`${checkout.url}/visual-environment`)
})

test("application renders its desktop layout", async ({ page }) => {
  await expect(page.getByTestId("viewport")).toHaveText("Desktop layout")
})

test("application uses full motion", async ({ page }) => {
  await expect(page.getByTestId("motion")).toHaveText("Full motion")
})

test("application animation keeps its expected duration", async ({ page }) => {
  await expect(page.getByTestId("animation")).toHaveText("Normal animation speed")
})
