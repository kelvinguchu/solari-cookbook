import { expect, test } from "@playwright/test"

import { mkdir, writeFile } from "node:fs/promises"
import { resolve } from "node:path"

import {
  discoverRepairSourceCandidates,
  readSafeRepairContext,
  readSafeTestContext,
  readSafeTestSource,
} from "../../src/investigator/safe-source.js"

async function prepareFixtureRoot(fixtureRoot: string): Promise<string> {
  await mkdir(fixtureRoot, { recursive: true })
  return fixtureRoot
}

test("safe context follows only bounded local source imports", async (
  { browserName: _browserName },
  testInfo,
) => {
  const fixtureRoot = await prepareFixtureRoot(testInfo.outputPath("safe-source"))
  const dependencyPath = resolve(fixtureRoot, "checkout.ts")
  const testPath = resolve(fixtureRoot, "checkout.spec.ts")
  await writeFile(dependencyPath, "export const deadlineMs = 100\n", "utf8")
  await writeFile(
    testPath,
    'import { deadlineMs } from "./checkout.js"\ntest(String(deadlineMs), async () => true)\n',
    "utf8",
  )

  const context = await readSafeTestContext(process.cwd(), testPath)
  expect(context.map((source) => source.path)).toEqual([
    expect.stringContaining("checkout.spec.ts"),
    expect.stringContaining("checkout.ts"),
  ])
})

test("safe source reader bounds paths and blocks credential-like assignments", async (
  { browserName: _browserName },
  testInfo,
) => {
  const fixtureRoot = await prepareFixtureRoot(testInfo.outputPath("safe-source"))
  const safePath = resolve(fixtureRoot, "checkout.spec.ts")
  await writeFile(safePath, "test('checkout', async () => true)\n", "utf8")
  await expect(readSafeTestSource(process.cwd(), safePath)).resolves.toMatchObject({
    content: expect.stringContaining("checkout"),
  })

  const secretPath = resolve(fixtureRoot, "secret.spec.ts")
  const sensitiveValue = ["credential", "value", "must", "not", "leave"].join("-")
  await writeFile(secretPath, `const apiKey = '${sensitiveValue}'\n`, "utf8")
  await expect(readSafeTestSource(process.cwd(), secretPath)).rejects.toThrow(/credential/u)
  await expect(readSafeTestSource(process.cwd(), "../outside.spec.ts")).rejects.toThrow(
    /inside the project/u,
  )
})

test("repair context includes explicitly approved application sources", async (
  { browserName: _browserName },
  testInfo,
) => {
  const fixtureRoot = await prepareFixtureRoot(testInfo.outputPath("repair-source"))
  const testPath = resolve(fixtureRoot, "checkout.spec.ts")
  const applicationPath = resolve(fixtureRoot, "checkout-controller.ts")
  await writeFile(testPath, "test('checkout', async () => true)\n", "utf8")
  await writeFile(applicationPath, "export const completeCheckout = () => 'complete'\n", "utf8")

  const context = await readSafeRepairContext(process.cwd(), testPath, [applicationPath])

  expect(context.map((source) => source.path)).toEqual([
    expect.stringContaining("checkout.spec.ts"),
    expect.stringContaining("checkout-controller.ts"),
  ])
})

test("repair source discovery follows local imports from every test in a selected folder", async (
  { browserName: _browserName },
  testInfo,
) => {
  const fixtureRoot = await prepareFixtureRoot(testInfo.outputPath("source-discovery"))
  const testsDirectory = resolve(fixtureRoot, "tests")
  const sourceDirectory = resolve(fixtureRoot, "src")
  await mkdir(testsDirectory, { recursive: true })
  await mkdir(sourceDirectory, { recursive: true })
  await writeFile(
    resolve(testsDirectory, "checkout.spec.ts"),
    'import { checkout } from "../src/checkout.js"\ntest(String(checkout), async () => true)\n',
    "utf8",
  )
  await writeFile(
    resolve(testsDirectory, "cart.spec.ts"),
    'import { cart } from "../src/cart.js"\ntest(String(cart), async () => true)\n',
    "utf8",
  )
  await writeFile(resolve(sourceDirectory, "checkout.ts"), "export const checkout = true\n", "utf8")
  await writeFile(resolve(sourceDirectory, "cart.ts"), "export const cart = true\n", "utf8")

  const candidates = await discoverRepairSourceCandidates(process.cwd(), testsDirectory)

  expect(candidates).toEqual([
    expect.stringContaining("src/cart.ts"),
    expect.stringContaining("src/checkout.ts"),
  ])
})
