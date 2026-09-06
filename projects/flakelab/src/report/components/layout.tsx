export interface SpecEntry {
  readonly label: string
  readonly value: React.ReactNode
  /** Renders the value as wrapping monospace, for paths, patterns and signatures. */
  readonly mono?: boolean
}

/**
 * A numbered report section. The ordinal is decorative so the accessible heading stays
 * "Verdict" rather than "01 Verdict".
 */
export function Section({ children, id, ordinal, title, meta }: Readonly<{
  children: React.ReactNode
  id: string
  ordinal: string
  title: string
  meta?: React.ReactNode
}>): React.JSX.Element {
  return <section aria-label={title} className="section" id={id}>
    <div className="section-head">
      <h2 className="section-title" id={`${id}-title`}>
        <span aria-hidden="true" className="section-ordinal">{ordinal}</span>
        {title}
      </h2>
      <span aria-hidden="true" className="section-rule" />
      {meta ? <span className="section-meta">{meta}</span> : undefined}
    </div>
    {children}
  </section>
}

/** Label/value evidence rows. A description list, because that is what these rows are. */
export function SpecList({ entries }: Readonly<{
  entries: readonly SpecEntry[]
}>): React.JSX.Element {
  return <dl className="spec">
    {entries.map((entry) => <div className="spec-row" key={entry.label}>
      <dt>{entry.label}</dt>
      <dd className={entry.mono ? "spec-mono" : undefined}>{entry.value}</dd>
    </div>)}
  </dl>
}

/**
 * Keeps wide evidence tables scrollable inside their own region instead of overflowing the
 * page, and keeps that region reachable from the keyboard.
 */
export function TableScroll({ children, label }: Readonly<{
  children: React.ReactNode
  label: string
}>): React.JSX.Element {
  return <div aria-label={label} className="table-scroll" role="region" tabIndex={0}>
    {children}
  </div>
}
