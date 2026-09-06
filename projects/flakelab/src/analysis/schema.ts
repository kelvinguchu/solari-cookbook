import { z } from "zod"

import {
  scanStatusSchema,
  scanTestIdentitySchema,
  scanTestResultSchema,
  scanTotalsSchema,
} from "../scan/schema.js"

export const analysisSourceKindSchema = z.enum(["blob-archive", "blob-directory"])

export const analysisFindingSchema = z.object({
  diagnosticArtifacts: z.number().int().nonnegative(),
  failureModes: z.number().int().nonnegative(),
  failureOccurrences: z.number().int().nonnegative(),
  identity: scanTestIdentitySchema,
  novelFailureModes: z.number().int().nonnegative(),
  rank: z.number().int().positive(),
  reasons: z.array(z.string().min(1)).max(4),
  score: z.number().int().nonnegative(),
  status: scanTestResultSchema.shape.status,
})

export const analysisArtifactSchema = z.object({
  artifactDirectory: z.string().min(1).nullable(),
  baseline: z.string().min(1).nullable(),
  findings: z.array(analysisFindingSchema),
  generatedAt: z.iso.datetime(),
  recommendedTarget: scanTestIdentitySchema.nullable(),
  runnerErrors: z.array(z.string().min(1).max(2_000)),
  source: z.object({
    archiveCount: z.number().int().positive(),
    kind: analysisSourceKindSchema,
    path: z.string().min(1),
  }),
  status: scanStatusSchema,
  tests: z.array(scanTestResultSchema),
  totals: scanTotalsSchema,
})

export const analysisBaselineSchema = z.object({
  tests: z.array(scanTestResultSchema),
})

export type AnalysisArtifact = z.infer<typeof analysisArtifactSchema>
export type AnalysisFinding = z.infer<typeof analysisFindingSchema>
export type AnalysisSourceKind = z.infer<typeof analysisSourceKindSchema>
