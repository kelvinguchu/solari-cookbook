import type { EvidenceReport } from "../schema.js"
import { percent, RateCell, TrialCounts } from "./indicators.js"
import { Section, TableScroll } from "./layout.js"

function RunEvidence({ runs }: Readonly<{
  runs: EvidenceReport["experiments"][number]["representativeRuns"]
}>): React.JSX.Element {
  if (runs.length === 0) {
    return <span className="evidence-empty">No recording retained</span>
  }
  return <span className="run-evidence">{runs.map((run) => <span key={run.trialId}>
    <span className="run-status">{run.status}</span>
    {run.artifacts.map((artifact) => <a
      className="ref"
      href={artifact.path}
      key={`${run.trialId}-${artifact.name}`}
    >{artifact.name}</a>)}
  </span>)}</span>
}

export function ExperimentSection({ report }: Readonly<{
  report: EvidenceReport
}>): React.JSX.Element {
  return <Section
    id="experiments"
    meta={`${report.experiments.length} interventions`}
    ordinal="04"
    title="Experiment record"
  >
    <p className="table-note">
      Controlled interventions in execution order. Floor is the 80% lower confidence bound on
      the observed failure rate.
    </p>
    <TableScroll label="Experiment record">
      <table className="grid">
        <caption className="sr-only">Experiment record</caption>
        <thead>
          <tr>
            <th scope="col">ID</th>
            <th scope="col">Tests</th>
            <th scope="col">Condition</th>
            <th className="num" scope="col">Trials</th>
            <th className="num" scope="col">Failure rate</th>
            <th className="num" scope="col">Floor</th>
            <th scope="col">Representative evidence</th>
          </tr>
        </thead>
        <tbody>
          {report.experiments.map((experiment) => <tr id={`exp-${experiment.id}`} key={experiment.id}>
            <th className="mono id-cell" scope="row">{experiment.id}</th>
            <td className="mono">{experiment.hypothesisId}</td>
            <td>{experiment.condition}</td>
            <td className="num"><TrialCounts result={experiment.result} /></td>
            <td className="num"><RateCell rate={experiment.result.failureRate} /></td>
            <td className="num mono">{percent(experiment.result.lowerBound80)}</td>
            <td><RunEvidence runs={experiment.representativeRuns} /></td>
          </tr>)}
        </tbody>
      </table>
    </TableScroll>
  </Section>
}
