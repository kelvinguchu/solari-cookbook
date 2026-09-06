import type { Fault } from "../../domain/schema.js"
import type { EvidenceReport } from "../schema.js"
import { percent } from "./indicators.js"
import type { SpecEntry } from "./layout.js"
import { Section, SpecList } from "./layout.js"

type Representative = EvidenceReport["experiments"][number]["representativeRuns"][number] & {
  experimentId: string
}

function representativeRun(
  report: EvidenceReport,
  status: Representative["status"],
): Representative | undefined {
  for (const experiment of report.experiments) {
    const run = experiment.representativeRuns.find((candidate) => candidate.status === status)
    if (run) {
      return { ...run, experimentId: experiment.id }
    }
  }
  return undefined
}

function RepresentativeRun({ run }: Readonly<{ run: Representative }>): React.JSX.Element {
  return <article className={`representative representative-${run.status}`}>
    <h4>{run.status === "passed" ? "Passing control" : "Failing intervention"}</h4>
    <p><a className="ref" href={`#exp-${encodeURIComponent(run.experimentId)}`}>
      {run.experimentId}
    </a> · {run.trialId} · {run.durationMs} ms</p>
    <p>{run.artifacts.length > 0
      ? run.artifacts.map((artifact) => <a
        className="artifact-inline"
        href={artifact.path}
        key={`${run.trialId}-${artifact.name}`}
      >Open {artifact.name}</a>)
      : "No recording was retained for this run."}</p>
  </article>
}

function RepresentativeComparison({ report }: Readonly<{
  report: EvidenceReport
}>): React.JSX.Element | undefined {
  const passing = representativeRun(report, "passed")
  const failing = representativeRun(report, "failed")
  if (!passing || !failing) {
    return undefined
  }
  return <div className="representative-comparison">
    <RepresentativeRun run={passing} />
    <RepresentativeRun run={failing} />
  </div>
}

function byteLabel(count: number): string {
  return `${count} response ${count === 1 ? "byte" : "bytes"}`
}

type StateFault = Extract<Fault, { kind: "auth-cookie-expiry" | "storage-state-delay" }>
type TemporalFault = Extract<Fault, { kind: "clock-jump" | "locale" | "timezone" }>
type VisualFault = Extract<Fault, { kind: "animation-speed" | "reduced-motion" | "viewport" }>
type RunnerFault = Extract<Fault, { kind: "shared-state-interference" | "worker-pressure" }>
type EnvironmentFault = StateFault | TemporalFault | VisualFault

function isStateFault(fault: Fault): fault is StateFault {
  return fault.kind === "auth-cookie-expiry" || fault.kind === "storage-state-delay"
}

function isTemporalFault(fault: Fault): fault is TemporalFault {
  return fault.kind === "clock-jump" || fault.kind === "locale" || fault.kind === "timezone"
}

function isEnvironmentFault(fault: Fault): fault is EnvironmentFault {
  return isStateFault(fault)
    || isTemporalFault(fault)
    || fault.kind === "animation-speed"
    || fault.kind === "reduced-motion"
    || fault.kind === "viewport"
}

function stateFaultValue(fault: StateFault): string {
  return fault.kind === "auth-cookie-expiry"
    ? `withhold cookie ${fault.cookieName}`
    : `hide ${fault.storage} key ${fault.key} for ${fault.delayMs} ms`
}

function temporalFaultValue(fault: TemporalFault): string {
  if (fault.kind === "clock-jump") {
    return `shift clock ${fault.offsetMs} ms after ${fault.jumpAfterMs} ms`
  }
  return fault.kind === "locale"
    ? `set locale to ${fault.locale}`
    : `set timezone to ${fault.timezoneId}`
}

function visualFaultValue(fault: VisualFault): string {
  if (fault.kind === "animation-speed") {
    return `set animation speed to ${fault.rate}x`
  }
  return fault.kind === "reduced-motion"
    ? "enable reduced motion"
    : `set viewport to ${fault.width}x${fault.height}`
}

function environmentFaultValue(fault: EnvironmentFault): string {
  if (isStateFault(fault)) {
    return stateFaultValue(fault)
  }
  return isTemporalFault(fault) ? temporalFaultValue(fault) : visualFaultValue(fault)
}

function isRunnerFault(fault: Fault): fault is RunnerFault {
  return fault.kind === "worker-pressure" || fault.kind === "shared-state-interference"
}

function runnerFaultValue(fault: RunnerFault): string {
  return fault.kind === "worker-pressure"
    ? `run with ${fault.workers} parallel workers`
    : `overlap ${fault.copies} copies of the target`
}

function faultValue(fault: Fault): string {
  if (isEnvironmentFault(fault)) {
    return environmentFaultValue(fault)
  }
  if (isRunnerFault(fault)) {
    return runnerFaultValue(fault)
  }
  if (fault.kind === "event-loop-stall") {
    return `stall event loop ${fault.durationMs} ms after ${fault.startAfterMs} ms`
  }
  if (fault.kind === "network-delay") {
    return `${fault.delayMs} ms delay`
  }
  if (fault.kind === "request-failure") {
    return `HTTP ${fault.statusCode}`
  }
  if (fault.kind === "response-duplication") {
    return `duplicate ${byteLabel(fault.duplicateBytes)}`
  }
  if (fault.kind === "response-reordering") {
    return `hold first response in each pair ${fault.holdMs} ms`
  }
  if (fault.kind === "resource-loading-delay") {
    return `delay ${fault.resourceType} loading ${fault.delayMs} ms`
  }
  if (fault.kind === "startup-event-delay") {
    return `delay ${fault.event} listeners ${fault.delayMs} ms`
  }
  return `remove ${byteLabel(fault.removeBytes)}`
}

function triggerEntries(trigger: EvidenceReport["trigger"]): SpecEntry[] {
  const faultEntries = trigger.faults.flatMap((fault, index): SpecEntry[] => {
    const targetLabel = fault.kind === "worker-pressure"
      || fault.kind === "shared-state-interference"
      ? "Target"
      : "Route"
    return [
      { label: `Fault ${index + 1}`, mono: true, value: `${fault.kind} · ${faultValue(fault)}` },
      { label: `${targetLabel} ${index + 1}`, mono: true, value: fault.pattern },
    ]
  })
  const entries: SpecEntry[] = [
    ...faultEntries,
    { label: "Required failure rate", mono: true, value: `>= ${percent(trigger.minimumFailureRate)}` },
  ]
  if (trigger.signature) {
    entries.push({ label: "Failure signature", mono: true, value: trigger.signature })
  }
  return entries
}

export function ReproductionSection({ report }: Readonly<{
  report: EvidenceReport
}>): React.JSX.Element {
  return <Section id="reproduction" ordinal="02" title="Reproduction">
    <p className="lede">
      The stable hostile trigger. Applying it reproduces the failure in at least{" "}
      {percent(report.trigger.minimumFailureRate)} of trials.
    </p>
    <SpecList entries={triggerEntries(report.trigger)} />
    <RepresentativeComparison report={report} />
    <div className="prose">
      <h3 className="sub-title">Exact replay</h3>
      <pre className="command"><code>{report.replayCommand}</code></pre>
      <p className="note">
        Representative passing and failing recordings are linked from their experiment rows.
      </p>
    </div>
  </Section>
}
