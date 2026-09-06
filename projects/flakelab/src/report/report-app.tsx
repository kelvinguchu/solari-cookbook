import { ArtifactSection } from "./components/artifacts.js"
import { ExperimentSection } from "./components/experiments.js"
import { HypothesisSection } from "./components/hypotheses.js"
import { formatTimestamp } from "./components/indicators.js"
import { ProofSection } from "./components/proof.js"
import { ReproductionSection } from "./components/reproduction.js"
import { EvidenceSummarySection } from "./components/summary.js"
import { VerdictSection } from "./components/verdict.js"
import type { EvidenceReport } from "./schema.js"

interface ReportAppProps {
  readonly report: EvidenceReport
}

function Masthead({ report }: ReportAppProps): React.JSX.Element {
  return <header className="masthead">
    <p className="masthead-title">
      <span className="masthead-product">FlakeLab</span>
      <span className="masthead-kind">Evidence report</span>
    </p>
    <dl className="masthead-meta">
      <div>
        <dt>Generated</dt>
        <dd>{formatTimestamp(report.generatedAt)}</dd>
      </div>
      <div>
        <dt>Model</dt>
        <dd>{report.model}</dd>
      </div>
    </dl>
  </header>
}

export function ReportApp({ report }: ReportAppProps): React.JSX.Element {
  return <div className="page">
    <Masthead report={report} />
    <main>
      <h1 className="page-title">
        Causal evidence for <code>{report.test}</code>
      </h1>
      <VerdictSection report={report} />
      <ReproductionSection report={report} />
      <EvidenceSummarySection report={report} />
      <ExperimentSection report={report} />
      <HypothesisSection report={report} />
      <ProofSection report={report} />
      <ArtifactSection report={report} />
    </main>
    <footer className="colophon">
      <p>Generated locally by FlakeLab. Evidence embedded and schema-validated at render.</p>
      <p>No runtime network access · credentials redacted · content security policy enforced</p>
    </footer>
  </div>
}
