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

test("auth-cookie expiry withholds only the request cookie and preserves browser state", async ({
  context,
  page,
}) => {
  await context.addCookies([{ name: "session-id", value: "active", url: checkout.url }])
  const removeFaults = await installFaults(page, [{
    kind: "auth-cookie-expiry",
    pattern: "**/cookie-auth",
    cookieName: "session-id",
  }])

  await page.goto(`${checkout.url}/cookie-auth`)
  await expect(page.getByRole("status")).toHaveText("Authentication expired")

  await removeFaults()
  await page.goto(`${checkout.url}/cookie-auth`)
  await expect(page.getByRole("status")).toHaveText("Authenticated by cookie")
})

test("auth-cookie expiry leaves unrelated requests untouched", async ({ context, page }) => {
  await context.addCookies([{ name: "session-id", value: "active", url: checkout.url }])
  const removeFaults = await installFaults(page, [{
    kind: "auth-cookie-expiry",
    pattern: "**/unrelated",
    cookieName: "session-id",
  }])

  await page.goto(`${checkout.url}/cookie-auth`)
  await expect(page.getByRole("status")).toHaveText("Authenticated by cookie")
  await removeFaults()
})
