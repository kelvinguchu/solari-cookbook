import { z } from "zod"

export const scanStatusSchema = z.enum([
  "failed-every-run",
  "inconclusive",
  "mixed-outcomes",
  "no-failure-observed",
])

export const scanTestStatusSchema = z.enum([
  "errored",
  "failed-every-run",
  "mixed-outcomes",
  "no-failure-observed",
  "skipped",
])

const scanCountsSchema = z.object({
  errors: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  passed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
})

export const scanTotalsSchema = scanCountsSchema.extend({
  executions: z.number().int().nonnegative(),
  failureRate: z.number().min(0).max(1),
  lowerBound80: z.number().min(0).max(1),
  upperBound80: z.number().min(0).max(1),
})

export const scanTestIdentitySchema = z.object({
  column: z.number().int().positive(),
  file: z.string().min(1),
  line: z.number().int().positive(),
  project: z.string(),
  titlePath: z.array(z.string().min(1)).min(1),
})

export const scanAttachmentSchema = z.object({
  contentType: z.string().min(1),
  name: z.string().min(1),
  path: z.string().min(1),
})

export const scanFailureClusterSchema = z.object({
  firstObservedAttempt: z.number().int().positive(),
  lastObservedAttempt: z.number().int().positive(),
  observedRate: z.number().min(0).max(1),
  occurrences: z.number().int().positive(),
  representativeArtifacts: z.array(scanAttachmentSchema).max(3),
  representativeReason: z.string().min(1).max(2_000),
  signature: z.string().regex(/^[a-f0-9]{16}$/u),
})

export const scanTestResultSchema = z.object({
  counts: scanCountsSchema,
  failureClusters: z.array(scanFailureClusterSchema).max(5),
  failureRate: z.number().min(0).max(1),
  identity: scanTestIdentitySchema,
  lowerBound80: z.number().min(0).max(1),
  multipleFailureModes: z.boolean(),
  omittedFailureModes: z.number().int().nonnegative(),
  status: scanTestStatusSchema,
  trials: z.number().int().nonnegative(),
  upperBound80: z.number().min(0).max(1),
})

export const scanArtifactSchema = z.object({
  generatedAt: z.iso.datetime(),
  playwrightOutputDirectory: z.string().min(1).nullable(),
  runs: z.number().int().min(2).max(100),
  runnerErrors: z.array(z.string().min(1).max(2_000)),
  status: scanStatusSchema,
  target: z.string().min(1),
  tests: z.array(scanTestResultSchema),
  totals: scanTotalsSchema,
  workers: z.number().int().min(1).max(32),
})

export type ScanArtifact = z.infer<typeof scanArtifactSchema>
export type ScanAttachment = z.infer<typeof scanAttachmentSchema>
export type ScanCounts = z.infer<typeof scanCountsSchema>
export type ScanFailureCluster = z.infer<typeof scanFailureClusterSchema>
export type ScanStatus = z.infer<typeof scanStatusSchema>
export type ScanTestResult = z.infer<typeof scanTestResultSchema>
export type ScanTestStatus = z.infer<typeof scanTestStatusSchema>
export type ScanTotals = z.infer<typeof scanTotalsSchema>
