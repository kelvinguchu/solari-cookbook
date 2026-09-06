import type { EvidenceReport } from "../schema.js"
import { Section } from "./layout.js"

export function ArtifactSection({ report }: Readonly<{
  report: EvidenceReport
}>): React.JSX.Element {
  return <Section
    id="artifacts"
    meta={`${report.artifacts.length} files`}
    ordinal="07"
    title="Reproducible artifacts"
  >
    <p className="lede">
      Paths are relative to the project root. They open only when this report is read
      alongside the run that produced it; nothing here is fetched over the network.
    </p>
    <ul className="artifacts">
      {report.artifacts.map((artifact) => <li key={artifact.label}>
        <a className="artifact" href={artifact.path}>
          <span className="artifact-label">{artifact.label}</span>
          <span className="artifact-path">{artifact.path}</span>
        </a>
      </li>)}
    </ul>
    <h3 className="sub-title source-title">Source context inspected for repair</h3>
    <ul className="source-paths">
      {report.sourcePaths.map((path) => <li key={path}><code>{path}</code></li>)}
    </ul>
    <h3 className="sub-title source-title">Candidate edit locations</h3>
    <ul className="source-paths">
      {report.sourceLocations.map((location) => <li key={`${location.path}:${location.line}`}>
        <code>{location.path}:{location.line}</code>
      </li>)}
    </ul>
  </Section>
}
