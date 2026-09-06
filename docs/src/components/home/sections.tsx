import Link from "next/link"

interface SectionProps {
  children: React.ReactNode
  label: string
  lead?: string
  title: string
}

function Section({ children, label, lead, title }: SectionProps) {
  return (
    <section className="border-b border-fd-border">
      <div className="mx-auto w-full max-w-6xl px-6 py-20">
        <p className="fl-label">{label}</p>
        <h2 className="mt-4 max-w-2xl text-2xl font-medium tracking-tight text-balance">
          {title}
        </h2>
        {lead ? (
          <p className="mt-4 max-w-xl text-sm leading-7 text-fd-muted-foreground">{lead}</p>
        ) : null}
        <div className="mt-12">{children}</div>
      </div>
    </section>
  )
}

const PIPELINE: [string, string][] = [
  ["Observe", "Repeat the target under normal conditions and classify every outcome."],
  ["Intervene", "Apply one bounded fault against matched, same-seed clean controls."],
  ["Minimize", "Shrink the trigger to the smallest value that still changes the result."],
  ["Explain", "Let a bounded investigator compare competing hypotheses on compact evidence."],
  ["Repair", "Generate one narrow application-source candidate under a strict policy."],
  ["Prove", "Run hostile, control, regression, and static checks in a disposable microVM."],
  ["Review", "Read the reproducer, proof matrix, and offline report, then decide."],
]

export function PipelineRail() {
  return (
    <Section
      label="Workflow"
      lead="Each stage is cheap before it is expensive, and no stage is allowed to assert a cause the next one has not tested."
      title="Seven stages from an intermittent failure to reviewable evidence."
    >
      <ol className="grid gap-px border border-fd-border bg-fd-border sm:grid-cols-2 lg:grid-cols-4">
        {PIPELINE.map(([title, body], index) => (
          <li className="bg-fd-background p-5" key={title}>
            <p className="text-xs tabular-nums text-fd-muted-foreground">
              {String(index + 1).padStart(2, "0")}
            </p>
            <h3 className="mt-3 text-sm font-medium">{title}</h3>
            <p className="mt-2 text-xs leading-6 text-fd-muted-foreground">{body}</p>
          </li>
        ))}
        <li className="bg-fd-muted p-5">
          <p className="text-xs tabular-nums text-fd-muted-foreground">→</p>
          <h3 className="mt-3 text-sm font-medium">Nothing is applied</h3>
          <p className="mt-2 text-xs leading-6 text-fd-muted-foreground">
            The candidate stays a diff. FlakeLab never edits your checkout.
          </p>
        </li>
      </ol>
    </Section>
  )
}

export function PrincipleBanner() {
  return (
    <section className="fl-grid border-b border-fd-border">
      <div className="mx-auto w-full max-w-6xl px-6 py-24 text-center">
        <p className="fl-label">Design principle</p>
        <p className="mx-auto mt-6 max-w-3xl text-2xl leading-tight font-medium tracking-tight
          text-balance sm:text-3xl">
          AI proposes;
          <span className="text-fd-primary"> deterministic evidence decides.</span>
        </p>
        <p className="mx-auto mt-6 max-w-lg text-sm leading-7 text-fd-muted-foreground">
          The model may propose hypotheses and exact edits. It may not run shell commands,
          read the repository freely, choose trial counts or spend, weaken a test, apply a
          patch, or declare that a correlation is causal.
        </p>
      </div>
    </section>
  )
}

const COMMANDS: [string, string, string][] = [
  ["scan", "none", "Repeat a target and classify outcomes."],
  ["analyze", "none", "Triage an existing blob report without rerunning."],
  ["doctor", "none", "Check runtime, browser, privacy, and credentials."],
  ["diagnose", "optional", "Start from evidence; run only requested phases."],
  ["discover", "none", "Search one fault family and minimize a trigger."],
  ["replay", "none", "Re-run a reproducer and verify its signature."],
  ["investigate", "Groq", "Compare bounded hypotheses against experiments."],
  ["repair", "Groq + Solari", "Generate a constrained candidate and prove it."],
  ["prove", "Groq + Solari", "The whole pipeline as one bounded run."],
  ["report", "none", "Build one portable offline evidence report."],
  ["resume", "varies", "Continue a checkpoint without repeating work."],
  ["bisect", "Solari", "Statistically locate the introducing revision."],
]

export function CommandMap() {
  return (
    <Section
      label="Surface"
      lead="Local commands never touch a provider. Every chargeable operation is opt-in and announces its cost and credential boundary before it starts."
      title="Twelve commands. Provider use is always explicit."
    >
      <div className="grid gap-px border border-fd-border bg-fd-border sm:grid-cols-2 lg:grid-cols-3">
        {COMMANDS.map(([name, provider, body]) => (
          <Link
            className="group bg-fd-background p-5 transition-colors hover:bg-fd-accent
              focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-fd-ring"
            href={`/docs/commands/${name}`}
            key={name}
          >
            <div className="flex items-baseline justify-between gap-3">
              <h3 className="text-sm font-medium">
                <span className="text-fd-muted-foreground">flakelab </span>
                {name}
              </h3>
              <span
                className={`text-[0.625rem] tracking-wide uppercase ${
                  provider === "none"
                    ? "text-fd-muted-foreground"
                    : "text-fd-primary"
                }`}
              >
                {provider}
              </span>
            </div>
            <p className="mt-2 text-xs leading-6 text-fd-muted-foreground">{body}</p>
          </Link>
        ))}
      </div>
    </Section>
  )
}

const FAULT_GROUPS: [string, string[]][] = [
  ["Network", [
    "network-delay",
    "response-truncation",
    "response-duplication",
    "response-reordering",
  ]],
  ["Lifecycle", ["resource-loading-delay", "startup-event-delay", "event-loop-stall"]],
  ["State and time", [
    "auth-cookie-expiry",
    "storage-state-delay",
    "clock-jump",
    "locale",
    "timezone",
  ]],
  ["Visual", ["viewport", "reduced-motion", "animation-speed"]],
  ["Concurrency", ["worker-pressure", "shared-state-interference"]],
]

export function FaultCatalog() {
  return (
    <Section
      label="Experiments"
      lead="Every fault is deterministic, bounded, reversible, and compared with a matched clean control. A fault that did not actually apply is never counted as causal evidence."
      title="Seventeen fault families across five groups."
    >
      <div className="grid gap-px border border-fd-border bg-fd-border md:grid-cols-2 lg:grid-cols-3">
        {FAULT_GROUPS.map(([group, faults]) => (
          <div className="bg-fd-background p-5" key={group}>
            <h3 className="fl-label">{group}</h3>
            <ul className="mt-4 space-y-2">
              {faults.map((fault) => (
                <li className="text-xs text-fd-muted-foreground" key={fault}>
                  <span className="mr-2 text-fd-primary">·</span>
                  <code className="bg-transparent p-0 text-fd-foreground">{fault}</code>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="bg-fd-muted p-5">
          <h3 className="fl-label">Acceptance gate</h3>
          <p className="mt-4 text-xs leading-6 text-fd-muted-foreground">
            A trigger is accepted only when the intervention&rsquo;s 80% Wilson lower bound
            clears the matched control&rsquo;s upper bound, on the same normalized failure
            signature, and survives minimization plus independent confirmation.
          </p>
        </div>
      </div>
    </Section>
  )
}

const ARTIFACTS: [string, string][] = [
  ["flakelab.repro.yaml", "Portable, strict fault and confirmation recipe."],
  ["flakelab.investigation.json", "Hypotheses, experiments, and bounded source context."],
  ["candidate.diff", "Reviewable source patch. Never auto-applied."],
  ["flakelab.proof.json", "Static checks, hostile trials, controls, regressions."],
  ["flakelab.report.html", "Self-contained offline evidence report."],
  [".flakelab/runs/diagnose.json", "Resumable checkpoint with planned and actual usage."],
]

export function ArtifactTable() {
  return (
    <Section
      label="Output"
      lead="Human summaries go to the terminal, machine-readable JSON stays clean on stdout, and every path is project-relative."
      title="Evidence you can attach to a pull request."
    >
      <ul className="border-t border-fd-border">
        {ARTIFACTS.map(([path, body]) => (
          <li
            className="flex flex-col gap-1 border-b border-fd-border py-4 sm:flex-row
              sm:items-baseline sm:gap-8"
            key={path}
          >
            <code className="w-full max-w-xs shrink-0 bg-transparent p-0 text-xs
              text-fd-foreground">
              {path}
            </code>
            <span className="text-xs leading-6 text-fd-muted-foreground">{body}</span>
          </li>
        ))}
      </ul>
    </Section>
  )
}

const NOT: string[] = [
  "a replacement for Playwright",
  "a hosted test-history dashboard",
  "a cross-browser device cloud",
  "a general-purpose chaos engineering platform",
  "a bot that edits your checkout or opens a pull request",
  "a reason to hide failures with retries or weaker assertions",
]

export function BoundarySection() {
  return (
    <section>
      <div className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="grid gap-12 lg:grid-cols-2">
          <div>
            <p className="fl-label">Boundaries</p>
            <h2 className="mt-4 text-2xl font-medium tracking-tight text-balance">
              What FlakeLab is not.
            </h2>
            <p className="mt-4 max-w-md text-sm leading-7 text-fd-muted-foreground">
              Bounded proof is not universal correctness. FlakeLab reports what it measured
              and says so when it cannot estimate something.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                className="border border-fd-foreground bg-fd-foreground px-5 py-2.5 text-xs
                  font-medium text-fd-background transition-opacity hover:opacity-85
                  focus-visible:outline-2 focus-visible:outline-offset-2
                  focus-visible:outline-fd-ring"
                href="/docs/introduction"
              >
                Read the introduction
              </Link>
              <Link
                className="border border-fd-border px-5 py-2.5 text-xs transition-colors
                  hover:bg-fd-accent focus-visible:outline-2 focus-visible:outline-offset-2
                  focus-visible:outline-fd-ring"
                href="/docs/comparisons"
              >
                Compare with alternatives
              </Link>
            </div>
          </div>

          <ul className="space-y-0 self-start border-t border-fd-border">
            {NOT.map((item) => (
              <li
                className="flex items-baseline gap-3 border-b border-fd-border py-3 text-xs
                  leading-6 text-fd-muted-foreground"
                key={item}
              >
                <span aria-hidden className="text-fd-muted-foreground">✗</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}
