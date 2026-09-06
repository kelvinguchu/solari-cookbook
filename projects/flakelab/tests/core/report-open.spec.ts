import { expect, test } from "@playwright/test"

import { confirmLocalReportOpen } from "../../src/report/open.js"

test("report opening is offered only in an interactive non-CI terminal", async () => {
  let questions = 0
  const ask = (): Promise<string> => {
    questions += 1
    return Promise.resolve("")
  }

  await expect(confirmLocalReportOpen({ ask, inputIsTTY: false, outputIsTTY: true }))
    .resolves.toBe(false)
  await expect(confirmLocalReportOpen({
    ask,
    environment: { CI: "true" },
    inputIsTTY: true,
    outputIsTTY: true,
  })).resolves.toBe(false)
  expect(questions).toBe(0)
})

test("interactive report opening defaults to yes and accepts an explicit choice", async () => {
  const interactive = { environment: {}, inputIsTTY: true, outputIsTTY: true }

  await expect(confirmLocalReportOpen({ ...interactive, ask: () => Promise.resolve("") }))
    .resolves.toBe(true)
  await expect(confirmLocalReportOpen({ ...interactive, ask: () => Promise.resolve("yes") }))
    .resolves.toBe(true)
  await expect(confirmLocalReportOpen({ ...interactive, ask: () => Promise.resolve("n") }))
    .resolves.toBe(false)
})
