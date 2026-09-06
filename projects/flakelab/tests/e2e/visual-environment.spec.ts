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

test("viewport and reduced motion are applied and removed", async ({ page }) => {
  const remove = await installFaults(page, [
    { kind: "viewport", pattern: "**/visual-environment", width: 375, height: 667 },
    { kind: "reduced-motion", pattern: "**/visual-environment" },
  ])
  await page.goto(`${checkout.url}/visual-environment`)
  await expect(page.getByTestId("viewport")).toHaveText("Compact layout")
  await expect(page.getByTestId("motion")).toHaveText("Reduced motion")
  await remove()
  await page.goto(`${checkout.url}/visual-environment`)
  await expect(page.getByTestId("viewport")).toHaveText("Desktop layout")
  await expect(page.getByTestId("motion")).toHaveText("Full motion")
})

test("animation speed changes playback without accelerating timers", async ({ page }) => {
  const remove = await installFaults(page, [{
    kind: "animation-speed",
    pattern: "**/visual-environment",
    rate: 10,
  }])
  await page.goto(`${checkout.url}/visual-environment`)
  await expect(page.getByTestId("animation")).toHaveText("Animation accelerated")
  await remove()
  await page.goto(`${checkout.url}/visual-environment`)
  await expect(page.getByTestId("animation")).toHaveText("Normal animation speed")
})
