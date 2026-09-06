import type {
  AnimationSpeedFault,
  BrowserStorageArea,
  ClockJumpFault,
  EventLoopStallFault,
  Fault,
  StorageStateDelayFault,
  StartupEvent,
  StartupEventDelayFault,
} from "../domain/schema.js"

export type DocumentBootstrapFault =
  | AnimationSpeedFault
  | ClockJumpFault
  | EventLoopStallFault
  | StorageStateDelayFault
  | StartupEventDelayFault

const EVENT_TARGETS: Record<StartupEvent, { eventName: string; target: string }> = {
  "dom-content-loaded": { eventName: "DOMContentLoaded", target: "document" },
  load: { eventName: "load", target: "window" },
}

const STORAGE_TARGETS: Record<BrowserStorageArea, string> = {
  "local-storage": "localStorage",
  "session-storage": "sessionStorage",
}

export function isDocumentBootstrapFault(fault: Fault): fault is DocumentBootstrapFault {
  return fault.kind === "animation-speed"
    || fault.kind === "clock-jump"
    || fault.kind === "event-loop-stall"
    || fault.kind === "storage-state-delay"
    || fault.kind === "startup-event-delay"
}

function clockRegistrations(faults: readonly ClockJumpFault[]): string[] {
  return faults.map((fault) => fault.jumpAfterMs === 0
    ? `flakelabClockOffsetMs += ${fault.offsetMs}`
    : `setTimeout(() => { flakelabClockOffsetMs += ${fault.offsetMs} }, ${fault.jumpAfterMs})`)
}

function totalDelay(faults: readonly StartupEventDelayFault[], event: StartupEvent): number {
  return faults.reduce(
    (total, fault) => total + (fault.event === event ? fault.delayMs : 0),
    0,
  )
}

function startupEventRegistrations(faults: readonly StartupEventDelayFault[]): string[] {
  return (["dom-content-loaded", "load"] as const)
    .map((event) => ({ ...EVENT_TARGETS[event], delayMs: totalDelay(faults, event) }))
    .filter((entry) => entry.delayMs > 0)
    .map((entry) => `trap(${entry.target}, ${JSON.stringify(entry.eventName)}, ${entry.delayMs})`)
}

function stallRegistrations(faults: readonly EventLoopStallFault[]): string[] {
  return faults.map((fault) => `document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
      const flakelabStallDeadline = performance.now() + ${fault.durationMs}
      while (performance.now() < flakelabStallDeadline) {}
    }, ${fault.startAfterMs})
  }, { capture: true, once: true })`)
}

function storageRules(faults: readonly StorageStateDelayFault[]): string[] {
  return faults.map((fault) => `{
    storage: ${JSON.stringify(STORAGE_TARGETS[fault.storage])},
    key: ${JSON.stringify(fault.key)},
    until: performance.now() + ${fault.delayMs}
  }`)
}

export function documentBootstrapScript(faults: readonly DocumentBootstrapFault[]): string {
  const animationFault = faults.find((fault): fault is AnimationSpeedFault =>
    fault.kind === "animation-speed")
  const startupFaults = faults.filter((fault): fault is StartupEventDelayFault =>
    fault.kind === "startup-event-delay")
  const stallFaults = faults.filter((fault): fault is EventLoopStallFault =>
    fault.kind === "event-loop-stall")
  const storageFaults = faults.filter((fault): fault is StorageStateDelayFault =>
    fault.kind === "storage-state-delay")
  const clockFaults = faults.filter((fault): fault is ClockJumpFault =>
    fault.kind === "clock-jump")
  const registrations = [
    ...clockRegistrations(clockFaults),
    ...startupEventRegistrations(startupFaults),
    ...stallRegistrations(stallFaults),
  ]
  return `(() => {
  const flakelabAnimationRate = ${animationFault?.rate ?? 1}
  if (flakelabAnimationRate !== 1) {
    const adjustAnimation = (animation) => { animation.playbackRate = flakelabAnimationRate }
    const adjustTarget = (target) => target.getAnimations().forEach(adjustAnimation)
    const originalAnimate = Element.prototype.animate
    Element.prototype.animate = function (...argumentsList) {
      const animation = Reflect.apply(originalAnimate, this, argumentsList)
      adjustAnimation(animation)
      return animation
    }
    const adjustEventTarget = (event) => {
      if (event.target instanceof Element) adjustTarget(event.target)
    }
    document.addEventListener("animationstart", adjustEventTarget, true)
    document.addEventListener("transitionrun", adjustEventTarget, true)
  }
  const FlakeLabNativeDate = Date
  let flakelabClockOffsetMs = 0
  const flakelabNow = () => FlakeLabNativeDate.now() + flakelabClockOffsetMs
  if (${clockFaults.length} > 0) {
    globalThis.Date = new Proxy(FlakeLabNativeDate, {
      apply(target, thisArgument, argumentsList) {
        return argumentsList.length === 0
          ? new FlakeLabNativeDate(flakelabNow()).toString()
          : Reflect.apply(target, thisArgument, argumentsList)
      },
      construct(target, argumentsList, newTarget) {
        const values = argumentsList.length === 0 ? [flakelabNow()] : argumentsList
        return Reflect.construct(target, values, newTarget)
      },
      get(target, property, receiver) {
        return property === "now" ? flakelabNow : Reflect.get(target, property, receiver)
      }
    })
  }
  const trap = (target, eventName, delayMs) => {
    let replaying = false
    target.addEventListener(eventName, (event) => {
      if (replaying) return
      event.stopImmediatePropagation()
      setTimeout(() => {
        replaying = true
        target.dispatchEvent(new Event(eventName))
        replaying = false
      }, delayMs)
    }, { capture: true })
  }
  const storageRules = [${storageRules(storageFaults).join(",\n  ")}]
  if (storageRules.length > 0) {
    const originalGetItem = Storage.prototype.getItem
    Storage.prototype.getItem = function (key) {
      const now = performance.now()
      const hidden = storageRules.some((rule) =>
        key === rule.key && this === window[rule.storage] && now < rule.until)
      return hidden ? null : originalGetItem.call(this, key)
    }
  }
  ${registrations.join("\n  ")}
})()
`
}

function scriptNonce(html: string): string | undefined {
  const match = /<script\b[^>]*\bnonce=(?:"([^"]+)"|'([^']+)')[^>]*>/iu.exec(html)
  return match?.[1] ?? match?.[2]
}

function escapeAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

export function injectDocumentBootstrap(body: Buffer, scriptPath: string): Buffer {
  const html = body.toString("utf8")
  const head = /<head\b[^>]*>/iu.exec(html)
  if (!head) {
    throw new Error("Document bootstrap faults require an HTML document with a head element")
  }
  const nonce = scriptNonce(html)
  const nonceAttribute = nonce ? ` nonce="${escapeAttribute(nonce)}"` : ""
  const tag = `<script src="${escapeAttribute(scriptPath)}"${nonceAttribute}></script>`
  const insertion = head.index + head[0].length
  return Buffer.from(`${html.slice(0, insertion)}${tag}${html.slice(insertion)}`, "utf8")
}
