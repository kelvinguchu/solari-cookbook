import type { Page, Route } from "@playwright/test"
import { randomUUID } from "node:crypto"
import { setTimeout as delay } from "node:timers/promises"

import type { Fault } from "../domain/schema.js"
import { faultSetSchema } from "../domain/schema.js"
import { isRunnerExecutionFault } from "../runner/execution-fault.js"
import {
  installPageContextFaults,
  isBrowserContextFault,
  isImmutableBrowserContextFault,
} from "./browser-context.js"
import { compileUrlPattern } from "./pattern.js"
import { withoutNamedCookies } from "./cookie-header.js"
import type { DocumentBootstrapFault } from "./document-bootstrap.js"
import {
  documentBootstrapScript,
  injectDocumentBootstrap,
  isDocumentBootstrapFault,
} from "./document-bootstrap.js"

export type RemoveFault = () => Promise<void>

interface CompiledFault {
  expression: RegExp
  fault: Fault
  matches: number
}

function applyResponseMutations(body: Buffer, faults: Fault[]): Buffer {
  return faults.reduce((current, fault) => {
    if (fault.kind === "response-duplication") {
      const duplicate = current.subarray(Math.max(0, current.length - fault.duplicateBytes))
      return Buffer.concat([current, duplicate])
    }
    if (fault.kind === "response-truncation") {
      return current.subarray(0, Math.max(0, current.length - fault.removeBytes))
    }
    return current
  }, body)
}

function matchingFaults(faults: CompiledFault[], route: Route): CompiledFault[] {
  const request = route.request()
  return faults.filter((entry) => {
    if (!entry.expression.test(request.url())) {
      return false
    }
    if (entry.fault.kind === "resource-loading-delay") {
      return entry.fault.resourceType === request.resourceType()
    }
    if (isBrowserContextFault(entry.fault)) {
      return request.resourceType() === "document"
    }
    return !isDocumentBootstrapFault(entry.fault) || request.resourceType() === "document"
  })
}

function responseHoldMs(entries: CompiledFault[]): number {
  let total = 0
  for (const entry of entries) {
    if (entry.fault.kind !== "response-reordering") {
      continue
    }
    const shouldHold = entry.matches % 2 === 0
    entry.matches += 1
    if (shouldHold) {
      total += entry.fault.holdMs
    }
  }
  return total
}

async function fulfillResponse(
  route: Route,
  responseFaults: Fault[],
  holdMs: number,
  bootstrapScriptPath?: string,
): Promise<void> {
  const upstream = await route.fetch()
  if (holdMs > 0) {
    await delay(holdMs)
  }
  if (responseFaults.length === 0 && !bootstrapScriptPath) {
    await route.fulfill({ response: upstream })
    return
  }
  const body = await upstream.body()
  if (body.length > 1_048_576) {
    throw new Error("Response mutation supports response bodies up to 1048576 bytes")
  }
  const withBootstrap = bootstrapScriptPath
    ? injectDocumentBootstrap(body, bootstrapScriptPath)
    : body
  const mutated = applyResponseMutations(withBootstrap, responseFaults)
  const headers: Record<string, string> = {
    ...upstream.headers(),
    "content-length": String(mutated.length),
  }
  delete headers["content-encoding"]
  delete headers["transfer-encoding"]
  await route.fulfill({ response: upstream, headers, body: mutated })
}

async function withExpiredAuthCookies(
  route: Route,
  faults: Fault[],
  operation: () => Promise<void>,
): Promise<void> {
  const cookieNames = faults.flatMap((fault) =>
    fault.kind === "auth-cookie-expiry" ? [fault.cookieName] : [])
  if (cookieNames.length === 0) {
    await operation()
    return
  }
  const requestHeaders = await route.request().allHeaders()
  const cookieResult = withoutNamedCookies(requestHeaders.cookie, cookieNames)
  if (cookieResult.removedNames.length !== new Set(cookieNames).size) {
    throw new Error("Auth cookie expiry matched a request without every named cookie")
  }
  const context = route.request().frame().page().context()
  const preservedCookies = (await context.cookies()).filter((cookie) =>
    cookieResult.removedNames.includes(cookie.name))
  for (const cookieName of cookieResult.removedNames) {
    await context.clearCookies({ name: cookieName })
  }
  try {
    await operation()
  } finally {
    await context.addCookies(preservedCookies)
  }
}

function requiresResponseFetch(options: {
  bootstrapFaults: DocumentBootstrapFault[]
  hasReordering: boolean
  responseFaults: Fault[]
}): boolean {
  return options.responseFaults.length > 0
    || options.bootstrapFaults.length > 0
    || options.hasReordering
}

async function applyForwardedFaults(
  route: Route,
  entries: CompiledFault[],
  faults: Fault[],
  registerBootstrapScript: (faults: DocumentBootstrapFault[]) => string,
): Promise<void> {
  const responseFaults = faults.filter((fault) =>
    fault.kind === "response-duplication" || fault.kind === "response-truncation")
  const bootstrapFaults = faults.filter(isDocumentBootstrapFault)
  const holdMs = responseHoldMs(entries)
  const hasReordering = faults.some((fault) => fault.kind === "response-reordering")
  if (!requiresResponseFetch({ bootstrapFaults, hasReordering, responseFaults })) {
    await route.continue()
    return
  }
  const bootstrapScriptPath = bootstrapFaults.length > 0
    ? registerBootstrapScript(bootstrapFaults)
    : undefined
  await fulfillResponse(route, responseFaults, holdMs, bootstrapScriptPath)
}

async function applyMatchingFaults(
  route: Route,
  entries: CompiledFault[],
  registerBootstrapScript: (faults: DocumentBootstrapFault[]) => string,
): Promise<void> {
  const faults = entries.map((entry) => entry.fault)
  const totalDelayMs = faults.reduce(
    (total, fault) => total + (
      fault.kind === "network-delay" || fault.kind === "resource-loading-delay"
        ? fault.delayMs
        : 0
    ),
    0,
  )
  if (totalDelayMs > 0) {
    await delay(totalDelayMs)
  }
  const failure = faults.find((fault) => fault.kind === "request-failure")
  if (failure?.kind === "request-failure") {
    await route.fulfill({
      status: failure.statusCode,
      contentType: "application/json",
      body: '{"error":"flakelab-injected-failure"}',
    })
    return
  }
  await withExpiredAuthCookies(
    route,
    faults,
    () => applyForwardedFaults(route, entries, faults, registerBootstrapScript),
  )
}

export async function installFaults(page: Page, input: readonly Fault[]): Promise<RemoveFault> {
  const validatedFaults = faultSetSchema.parse(input)
  if (validatedFaults.some(isImmutableBrowserContextFault)) {
    throw new Error("Locale and timezone faults require FlakeLab project-level execution")
  }
  if (validatedFaults.some(isRunnerExecutionFault)) {
    throw new Error("Worker and shared-state faults require FlakeLab project-level execution")
  }
  const faults = validatedFaults.map((fault): CompiledFault => ({
    expression: compileUrlPattern(fault.pattern),
    fault,
    matches: 0,
  }))
  const removePageContextFaults = await installPageContextFaults(page, validatedFaults)
  const bootstrapScriptBase = `/.well-known/flakelab/${randomUUID()}`
  const bootstrapScripts = new Map<string, string>()
  let bootstrapScriptIndex = 0
  const registerBootstrapScript = (bootstrapFaults: DocumentBootstrapFault[]): string => {
    const path = `${bootstrapScriptBase}/${bootstrapScriptIndex}.js`
    bootstrapScriptIndex += 1
    bootstrapScripts.set(path, documentBootstrapScript(bootstrapFaults))
    return path
  }
  const handleRoute = async (route: Route): Promise<void> => {
    const requestUrl = new URL(route.request().url())
    const bootstrapSource = bootstrapScripts.get(requestUrl.pathname)
    if (bootstrapSource) {
      await route.fulfill({
        status: 200,
        contentType: "text/javascript; charset=utf-8",
        body: bootstrapSource,
      })
      return
    }
    const matching = matchingFaults(faults, route)
    if (matching.length === 0) {
      await route.continue()
      return
    }
    await applyMatchingFaults(route, matching, registerBootstrapScript)
  }
  const pendingRoutes = new Set<Promise<void>>()
  const handler = (route: Route): Promise<void> => {
    const pending = handleRoute(route)
    pendingRoutes.add(pending)
    return pending.finally(() => pendingRoutes.delete(pending))
  }
  try {
    await page.route("**/*", handler)
  } catch (error) {
    await removePageContextFaults()
    throw error
  }
  return async () => {
    await Promise.allSettled([...pendingRoutes])
    const cleanup = await Promise.allSettled([
      page.unroute("**/*", handler),
      removePageContextFaults(),
    ])
    bootstrapScripts.clear()
    if (cleanup.some((result) => result.status === "rejected")) {
      throw new Error("FlakeLab could not completely remove direct browser faults")
    }
  }
}
