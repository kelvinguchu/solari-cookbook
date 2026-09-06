import { expect, test } from "@playwright/test"

import { withoutNamedCookies } from "../../src/faults/cookie-header.js"

test("cookie filtering removes only named cookies without exposing their values", () => {
  const result = withoutNamedCookies(
    "theme=dark; session-id=private-value; preference=a=b",
    ["session-id"],
  )

  expect(result).toEqual({
    header: "theme=dark; preference=a=b",
    removedNames: ["session-id"],
  })
  expect(JSON.stringify(result)).not.toContain("private-value")
})

test("cookie filtering distinguishes absence from an empty forwarded header", () => {
  expect(withoutNamedCookies("session-id=value", ["session-id"])).toEqual({
    removedNames: ["session-id"],
  })
  expect(withoutNamedCookies("theme=dark", ["session-id"])).toEqual({ removedNames: [] })
})
