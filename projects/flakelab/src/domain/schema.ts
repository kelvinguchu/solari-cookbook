import { z } from "zod"

export const loadingResourceTypeSchema = z.enum([
  "document",
  "font",
  "image",
  "script",
  "stylesheet",
])

export const startupEventSchema = z.enum(["dom-content-loaded", "load"])
export const browserStorageAreaSchema = z.enum(["local-storage", "session-storage"])
export const browserStorageKeySchema = z.string().min(1).max(256)
export const cookieNameSchema = z.string().min(1).max(128)
  .regex(/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/u, "cookieName must be a valid cookie token")

function isLocale(value: string): boolean {
  try {
    return Intl.getCanonicalLocales(value).length === 1
  } catch {
    return false
  }
}

function isTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(0)
    return true
  } catch {
    return false
  }
}

export const localeSchema = z.string().min(2).max(64)
  .refine(isLocale, "locale must be a valid BCP 47 language tag")
export const timeZoneSchema = z.string().min(1).max(255)
  .refine(isTimeZone, "timezoneId must be a supported IANA time zone")

export const authCookieExpiryFaultSchema = z.object({
  kind: z.literal("auth-cookie-expiry"),
  pattern: z.string().min(1).max(2_000),
  cookieName: cookieNameSchema,
}).strict()

export const animationSpeedFaultSchema = z.object({
  kind: z.literal("animation-speed"),
  pattern: z.string().min(1).max(2_000),
  rate: z.number().min(0.1).max(10),
}).strict()

export const clockJumpFaultSchema = z.object({
  kind: z.literal("clock-jump"),
  pattern: z.string().min(1).max(2_000),
  jumpAfterMs: z.number().int().min(0).max(30_000),
  offsetMs: z.number().int().min(-31_536_000_000).max(31_536_000_000)
    .refine((value) => value !== 0, "offsetMs cannot be zero"),
}).strict()

export const localeFaultSchema = z.object({
  kind: z.literal("locale"),
  pattern: z.string().min(1).max(2_000),
  locale: localeSchema,
}).strict()

export const networkDelayFaultSchema = z.object({
  kind: z.literal("network-delay"),
  pattern: z.string().min(1).max(2_000),
  delayMs: z.number().int().min(1).max(30_000),
}).strict()

export const eventLoopStallFaultSchema = z.object({
  kind: z.literal("event-loop-stall"),
  pattern: z.string().min(1).max(2_000),
  startAfterMs: z.number().int().min(0).max(30_000),
  durationMs: z.number().int().min(1).max(2_000),
}).strict()

export const requestFailureFaultSchema = z.object({
  kind: z.literal("request-failure"),
  pattern: z.string().min(1).max(2_000),
  statusCode: z.number().int().min(400).max(599),
}).strict()

export const responseTruncationFaultSchema = z.object({
  kind: z.literal("response-truncation"),
  pattern: z.string().min(1).max(2_000),
  removeBytes: z.number().int().min(1).max(1_048_576),
}).strict()

export const responseDuplicationFaultSchema = z.object({
  kind: z.literal("response-duplication"),
  pattern: z.string().min(1).max(2_000),
  duplicateBytes: z.number().int().min(1).max(1_048_576),
}).strict()

export const responseReorderingFaultSchema = z.object({
  kind: z.literal("response-reordering"),
  pattern: z.string().min(1).max(2_000),
  holdMs: z.number().int().min(1).max(30_000),
}).strict()

export const resourceLoadingDelayFaultSchema = z.object({
  kind: z.literal("resource-loading-delay"),
  pattern: z.string().min(1).max(2_000),
  resourceType: loadingResourceTypeSchema,
  delayMs: z.number().int().min(1).max(30_000),
}).strict()

export const reducedMotionFaultSchema = z.object({
  kind: z.literal("reduced-motion"),
  pattern: z.string().min(1).max(2_000),
}).strict()

export const startupEventDelayFaultSchema = z.object({
  kind: z.literal("startup-event-delay"),
  pattern: z.string().min(1).max(2_000),
  event: startupEventSchema,
  delayMs: z.number().int().min(1).max(30_000),
}).strict()

export const storageStateDelayFaultSchema = z.object({
  kind: z.literal("storage-state-delay"),
  pattern: z.string().min(1).max(2_000),
  storage: browserStorageAreaSchema,
  key: browserStorageKeySchema,
  delayMs: z.number().int().min(1).max(30_000),
}).strict()

export const timezoneFaultSchema = z.object({
  kind: z.literal("timezone"),
  pattern: z.string().min(1).max(2_000),
  timezoneId: timeZoneSchema,
}).strict()

export const viewportFaultSchema = z.object({
  kind: z.literal("viewport"),
  pattern: z.string().min(1).max(2_000),
  width: z.number().int().min(200).max(7_680),
  height: z.number().int().min(200).max(7_680),
}).strict()

export const workerPressureFaultSchema = z.object({
  kind: z.literal("worker-pressure"),
  pattern: z.string().min(1).max(2_000),
  workers: z.number().int().min(2).max(16),
}).strict()

export const sharedStateInterferenceFaultSchema = z.object({
  kind: z.literal("shared-state-interference"),
  pattern: z.string().min(1).max(2_000),
  copies: z.number().int().min(2).max(16),
}).strict()

export const faultSchema = z.discriminatedUnion("kind", [
  animationSpeedFaultSchema,
  authCookieExpiryFaultSchema,
  clockJumpFaultSchema,
  eventLoopStallFaultSchema,
  localeFaultSchema,
  networkDelayFaultSchema,
  requestFailureFaultSchema,
  reducedMotionFaultSchema,
  resourceLoadingDelayFaultSchema,
  responseDuplicationFaultSchema,
  responseReorderingFaultSchema,
  responseTruncationFaultSchema,
  sharedStateInterferenceFaultSchema,
  storageStateDelayFaultSchema,
  startupEventDelayFaultSchema,
  timezoneFaultSchema,
  viewportFaultSchema,
  workerPressureFaultSchema,
])

export type Fault = z.infer<typeof faultSchema>

function enforceAggregateFaultBounds(faults: Fault[], context: z.RefinementCtx): void {
  const totalTimingDelayMs = faults.reduce(
    (total, fault) => total + (
      fault.kind === "network-delay" || fault.kind === "resource-loading-delay"
        || fault.kind === "startup-event-delay"
        ? fault.delayMs
        : 0
    ),
    0,
  )
  const totalRemovedBytes = faults.reduce(
    (total, fault) => total + (fault.kind === "response-truncation" ? fault.removeBytes : 0),
    0,
  )
  const totalDuplicatedBytes = faults.reduce(
    (total, fault) => total + (fault.kind === "response-duplication" ? fault.duplicateBytes : 0),
    0,
  )
  const totalResponseHoldMs = faults.reduce(
    (total, fault) => total + (fault.kind === "response-reordering" ? fault.holdMs : 0),
    0,
  )
  const totalStallMs = faults.reduce(
    (total, fault) => total + (fault.kind === "event-loop-stall" ? fault.durationMs : 0),
    0,
  )
  const totalClockOffsetMs = faults.reduce(
    (total, fault) => total + (fault.kind === "clock-jump" ? Math.abs(fault.offsetMs) : 0),
    0,
  )
  if (totalTimingDelayMs > 30_000) {
    context.addIssue({ code: "custom", message: "combined timing delay cannot exceed 30000 ms" })
  }
  if (totalRemovedBytes > 1_048_576) {
    context.addIssue({
      code: "custom",
      message: "combined response truncation cannot exceed 1048576 bytes",
    })
  }
  if (totalDuplicatedBytes > 1_048_576) {
    context.addIssue({
      code: "custom",
      message: "combined response duplication cannot exceed 1048576 bytes",
    })
  }
  if (totalResponseHoldMs > 30_000) {
    context.addIssue({ code: "custom", message: "combined response hold cannot exceed 30000 ms" })
  }
  if (totalStallMs > 2_000) {
    context.addIssue({ code: "custom", message: "combined event-loop stall cannot exceed 2000 ms" })
  }
  if (totalClockOffsetMs > 31_536_000_000) {
    context.addIssue({ code: "custom", message: "combined clock jump cannot exceed one year" })
  }
}

function enforceUniqueContextFaults(faults: Fault[], context: z.RefinementCtx): void {
  for (const kind of [
    "animation-speed",
    "locale",
    "reduced-motion",
    "timezone",
    "viewport",
  ] as const) {
    if (faults.filter((fault) => fault.kind === kind).length > 1) {
      context.addIssue({ code: "custom", message: `only one ${kind} fault may be applied` })
    }
  }
}

function enforceUniqueRunnerFault(faults: Fault[], context: z.RefinementCtx): void {
  const runnerFaults = faults.filter((fault) =>
    fault.kind === "shared-state-interference" || fault.kind === "worker-pressure")
  if (runnerFaults.length > 1) {
    context.addIssue({
      code: "custom",
      message: "only one worker or shared-state fault may be applied",
    })
  }
}

function enforceFaultSet(faults: Fault[], context: z.RefinementCtx): void {
  enforceAggregateFaultBounds(faults, context)
  enforceUniqueContextFaults(faults, context)
  enforceUniqueRunnerFault(faults, context)
}

export const faultSetSchema = z.array(faultSchema)
  .min(1)
  .max(8)
  .superRefine(enforceFaultSet)

export const trialFaultSetSchema = z.array(faultSchema)
  .max(8)
  .superRefine(enforceFaultSet)

export const runRequestSchema = z.object({
  selector: z.string().min(1),
  runs: z.number().int().min(2).max(100),
  seed: z.number().int().min(0).max(0xffff_ffff),
  artifactDirectory: z.string().min(1),
  faults: faultSetSchema,
})

export const trialPlanSchema = z.object({
  trialId: z.string().min(1),
  index: z.number().int().nonnegative(),
  seed: z.number().int().min(0).max(0xffff_ffff),
  faults: trialFaultSetSchema,
})

export const trialOutcomeSchema = z.object({
  artifacts: z.array(z.object({
    contentType: z.string().min(1),
    name: z.string().min(1),
    path: z.string().min(1),
  })).max(5).optional(),
  status: z.enum(["passed", "failed", "error"]),
  durationMs: z.number().int().nonnegative(),
  exitCode: z.number().int().nullable(),
  failureSignature: z.string().min(1).optional(),
  failureReason: z.string().min(1).max(2_000).optional(),
})

export const runSummarySchema = z.object({
  total: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  baselineFailureRate: z.number().min(0).max(1),
  faultFailureRate: z.number().min(0).max(1),
})

const eventBaseSchema = z.object({
  runId: z.string().min(1),
  timestamp: z.iso.datetime(),
})

export const runEventSchema = z.discriminatedUnion("type", [
  eventBaseSchema.extend({
    type: z.literal("run.started"),
    request: runRequestSchema,
  }),
  eventBaseSchema.extend({
    type: z.literal("trial.started"),
    trial: trialPlanSchema,
  }),
  eventBaseSchema.extend({
    type: z.literal("trial.completed"),
    trial: trialPlanSchema,
    outcome: trialOutcomeSchema,
  }),
  eventBaseSchema.extend({
    type: z.literal("run.completed"),
    summary: runSummarySchema,
  }),
])

export type NetworkDelayFault = z.infer<typeof networkDelayFaultSchema>
export type AnimationSpeedFault = z.infer<typeof animationSpeedFaultSchema>
export type AuthCookieExpiryFault = z.infer<typeof authCookieExpiryFaultSchema>
export type BrowserStorageArea = z.infer<typeof browserStorageAreaSchema>
export type ClockJumpFault = z.infer<typeof clockJumpFaultSchema>
export type EventLoopStallFault = z.infer<typeof eventLoopStallFaultSchema>
export type LoadingResourceType = z.infer<typeof loadingResourceTypeSchema>
export type LocaleFault = z.infer<typeof localeFaultSchema>
export type RequestFailureFault = z.infer<typeof requestFailureFaultSchema>
export type ReducedMotionFault = z.infer<typeof reducedMotionFaultSchema>
export type ResourceLoadingDelayFault = z.infer<typeof resourceLoadingDelayFaultSchema>
export type ResponseDuplicationFault = z.infer<typeof responseDuplicationFaultSchema>
export type ResponseReorderingFault = z.infer<typeof responseReorderingFaultSchema>
export type ResponseTruncationFault = z.infer<typeof responseTruncationFaultSchema>
export type SharedStateInterferenceFault = z.infer<typeof sharedStateInterferenceFaultSchema>
export type StartupEvent = z.infer<typeof startupEventSchema>
export type StartupEventDelayFault = z.infer<typeof startupEventDelayFaultSchema>
export type StorageStateDelayFault = z.infer<typeof storageStateDelayFaultSchema>
export type TimezoneFault = z.infer<typeof timezoneFaultSchema>
export type RunEvent = z.infer<typeof runEventSchema>
export type RunRequest = z.infer<typeof runRequestSchema>
export type RunSummary = z.infer<typeof runSummarySchema>
export type TrialOutcome = z.infer<typeof trialOutcomeSchema>
export type TrialPlan = z.infer<typeof trialPlanSchema>
export type ViewportFault = z.infer<typeof viewportFaultSchema>
export type WorkerPressureFault = z.infer<typeof workerPressureFaultSchema>
