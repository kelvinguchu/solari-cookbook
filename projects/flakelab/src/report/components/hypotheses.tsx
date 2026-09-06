import type { EvidenceReport } from "../schema.js"
import type { Hypothesis } from "./indicators.js"
import { Section } from "./layout.js"

const GROUPS = [
  { heading: "Confirmed", status: "confirmed" },
  { heading: "Still proposed", status: "proposed" },
  { heading: "Rejected", status: "rejected" },
] as const

function EvidenceRefs({ hypothesis, known }: Readonly<{
  hypothesis: Hypothesis
  known: ReadonlySet<string>
}>): React.JSX.Element {
  return <p className="evidence-refs">
    <span className="evidence-label">Evidence</span>
    {hypothesis.evidenceExperimentIds.map((id) => known.has(id)
      ? <a className="ref" href={`#exp-${encodeURIComponent(id)}`} key={id}>{id}</a>
      : <span className="ref ref-missing" key={id}>{id}</span>)}
  </p>
}

function HypothesisEntry({ hypothesis, known }: Readonly<{
  hypothesis: Hypothesis
  known: ReadonlySet<string>
}>): React.JSX.Element {
  return <article className={`hypothesis hypothesis-${hypothesis.status}`}>
    <h4 className="hypothesis-head">
      <span className="hypothesis-id">{hypothesis.id}</span>
      <span className="hypothesis-statement">{hypothesis.statement}</span>
    </h4>
    <p className="hypothesis-explanation">{hypothesis.explanation}</p>
    <EvidenceRefs hypothesis={hypothesis} known={known} />
  </article>
}

export function HypothesisSection({ report }: Readonly<{
  report: EvidenceReport
}>): React.JSX.Element {
  const known = new Set(report.experiments.map((experiment) => experiment.id))
  const groups = GROUPS
    .map((group) => ({
      ...group,
      members: report.hypotheses.filter((entry) => entry.status === group.status),
    }))
    .filter((group) => group.members.length > 0)
  return <Section
    id="hypotheses"
    meta={`${report.hypotheses.length} explanations`}
    ordinal="05"
    title="Competing hypotheses"
  >
    {groups.map((group) => <div className={`group group-${group.status}`} key={group.status}>
      <h3 className="group-title">
        {group.heading}
        <span className="group-count">{group.members.length}</span>
      </h3>
      {group.members.map((hypothesis) => <HypothesisEntry
        hypothesis={hypothesis}
        key={hypothesis.id}
        known={known}
      />)}
    </div>)}
  </Section>
}
