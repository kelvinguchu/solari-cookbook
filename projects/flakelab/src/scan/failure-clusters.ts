import { createHash } from "node:crypto"

import type { ScanAttachment, ScanFailureCluster } from "./schema.js"

const MAX_FAILURE_CLUSTERS = 5
const MAX_REPRESENTATIVE_ARTIFACTS = 3

interface MutableFailureCluster {
  firstObservedAttempt: number
  lastObservedAttempt: number
  occurrences: number
  representativeArtifacts: Map<string, ScanAttachment>
  representativeReason: string
  signature: string
}

export type FailureClusterMap = Map<string, MutableFailureCluster>

export interface FailureObservation {
  artifacts: ScanAttachment[]
  attempt: number
  reason: string
}

export interface FinalizedFailureClusters {
  failureClusters: ScanFailureCluster[]
  multipleFailureModes: boolean
  omittedFailureModes: number
}

export function failureSignature(reason: string): string {
  return createHash("sha256").update(reason).digest("hex").slice(0, 16)
}

function isUsefulFailureArtifact(artifact: ScanAttachment): boolean {
  const name = artifact.name.toLowerCase()
  return name.includes("trace")
    || name.includes("screenshot")
    || name.includes("video")
    || artifact.contentType.startsWith("image/")
    || artifact.contentType.startsWith("video/")
}

function artifactKey(artifact: ScanAttachment): string {
  return `${artifact.name}:${artifact.contentType}`
}

function createCluster(observation: FailureObservation, signature: string): MutableFailureCluster {
  return {
    firstObservedAttempt: observation.attempt,
    lastObservedAttempt: observation.attempt,
    occurrences: 0,
    representativeArtifacts: new Map(),
    representativeReason: observation.reason,
    signature,
  }
}

export function recordFailureObservation(
  clusters: FailureClusterMap,
  observation: FailureObservation,
): void {
  const signature = failureSignature(observation.reason)
  const cluster = clusters.get(signature) ?? createCluster(observation, signature)
  cluster.occurrences += 1
  cluster.lastObservedAttempt = observation.attempt
  for (const artifact of observation.artifacts) {
    if (!isUsefulFailureArtifact(artifact)) {
      continue
    }
    if (cluster.representativeArtifacts.size >= MAX_REPRESENTATIVE_ARTIFACTS) {
      break
    }
    cluster.representativeArtifacts.set(artifactKey(artifact), artifact)
  }
  clusters.set(signature, cluster)
}

function compareClusters(left: MutableFailureCluster, right: MutableFailureCluster): number {
  const occurrenceOrder = right.occurrences - left.occurrences
  if (occurrenceOrder !== 0) {
    return occurrenceOrder
  }
  const attemptOrder = left.firstObservedAttempt - right.firstObservedAttempt
  return attemptOrder !== 0 ? attemptOrder : left.signature.localeCompare(right.signature)
}

function finalizeCluster(
  cluster: MutableFailureCluster,
  measuredTrials: number,
): ScanFailureCluster {
  return {
    firstObservedAttempt: cluster.firstObservedAttempt,
    lastObservedAttempt: cluster.lastObservedAttempt,
    observedRate: measuredTrials === 0 ? 0 : cluster.occurrences / measuredTrials,
    occurrences: cluster.occurrences,
    representativeArtifacts: [...cluster.representativeArtifacts.values()],
    representativeReason: cluster.representativeReason,
    signature: cluster.signature,
  }
}

export function finalizeFailureClusters(
  clusters: FailureClusterMap,
  measuredTrials: number,
): FinalizedFailureClusters {
  const failureClusters = [...clusters.values()]
    .sort(compareClusters)
    .slice(0, MAX_FAILURE_CLUSTERS)
    .map((cluster) => finalizeCluster(cluster, measuredTrials))
  return {
    failureClusters,
    multipleFailureModes: clusters.size > 1,
    omittedFailureModes: Math.max(0, clusters.size - failureClusters.length),
  }
}
