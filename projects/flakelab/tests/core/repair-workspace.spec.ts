import { expect, test } from "@playwright/test"

import { access, mkdir, readFile, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

import { nearbyRegressionSelectors } from "../../src/repair/validator.js"
import { remoteFaultArguments } from "../../src/repair/solari-validator.js"
import { applyCandidatePatch, createPatchWorkspace } from "../../src/repair/workspace.js"

test("candidate edits stay inside a disposable project copy", async () => {
  const sourcePath = "tests/support/checkout-server.ts"
  const originalPath = resolve(sourcePath)
  const original = await readFile(originalPath, "utf8")
  const workspace = await createPatchWorkspace(process.cwd())
  try {
    const diff = await applyCandidatePatch(workspace.root, {
      summary: "Update isolated checkout status behavior",
      rationale: "The workspace copy should change without touching source",
      edits: [{
        path: sourcePath,
        before: "status.textContent = 'Processing'",
        after: "status.textContent = 'Submitting'",
      }],
    })
    expect(diff).toContain("+        status.textContent = 'Submitting'")
    expect(await readFile(originalPath, "utf8")).toBe(original)
    expect(await readFile(resolve(workspace.root, sourcePath), "utf8")).toContain("Submitting")
  } finally {
    await workspace.cleanup()
  }
  await expect(access(workspace.root)).rejects.toThrow()
})

test("proof transports every supported fault without narrowing it to network delay", () => {
  const faults = [{
    copies: 3,
    kind: "shared-state-interference" as const,
    pattern: "tests/account.spec.ts",
  }]

  expect(remoteFaultArguments(faults, true)).toEqual([
    "--faults-json",
    JSON.stringify(faults),
    "--hostile",
  ])
})

test("nearby regression selection covers nested and co-located test variants", async ({
  browserName: _browserName,
}, testInfo) => {
  const root = testInfo.outputPath("regression-selection")
  await mkdir(resolve(root, "tests/e2e/nested"), { recursive: true })
  await mkdir(resolve(root, "src/checkout"), { recursive: true })
  await Promise.all([
    writeFile(resolve(root, "tests/e2e/checkout.spec.ts"), "", "utf8"),
    writeFile(resolve(root, "tests/e2e/nested/cart.test.tsx"), "", "utf8"),
    writeFile(resolve(root, "tests/e2e/nested/ignored.ts"), "", "utf8"),
    writeFile(resolve(root, "src/checkout/checkout.ts"), "", "utf8"),
    writeFile(resolve(root, "src/checkout/checkout.spec.js"), "", "utf8"),
  ])

  const selectors = await nearbyRegressionSelectors(
    root,
    "tests/e2e/checkout.spec.ts",
    {
      summary: "Update checkout completion after the request settles",
      rationale: "The application should transition only after the response arrives",
      edits: [{ path: "src/checkout/checkout.ts", before: "before", after: "after" }],
    },
  )

  expect(selectors).toEqual([
    "src/checkout/checkout.spec.js",
    "tests/e2e/nested/cart.test.tsx",
  ])
})
