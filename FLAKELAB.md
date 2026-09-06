# FlakeLab product improvement roadmap

## Goal

Make FlakeLab useful enough that a team can install it in an existing Playwright repository,
obtain a valuable answer quickly, and continue using it in local development and CI.

North-star outcome:

> Minimize the time from an existing intermittent Playwright failure to a reproducible causal
> trigger and reviewable evidence, without requiring developers to rewrite their tests.

Optimize for real use on unfamiliar repositories, not feature count or a scripted demonstration.
Keep Playwright responsible for test execution and ordinary reporting. Keep FlakeLab focused on
triage, causal experimentation, minimization, isolated proof, and actionable evidence.

## 1. Analyze existing Playwright CI reports

Add a read-only command for failures that have already happened:

```bash
flakelab analyze ./blob-report
flakelab analyze ./playwright-report.zip
```

Use Playwright's supported report tooling to convert or merge blob reports; do not depend directly
on a private blob serialization format. Accept a blob-report directory or archive, including
sharded and environment-tagged reports.

Acceptance criteria:

- The command produces useful triage without rerunning tests, modifying source, requiring cloud
  credentials, or consuming credits.
- Archive extraction is path-confined and rejects traversal, links, malformed archives, and
  unreasonable expanded sizes.
- Shards and environments are merged without collapsing distinct test identities.
- Existing traces, screenshots, videos, and error context remain linked to their test result.
- Failures are clustered by stable signature and ranked by recurrence, novelty when a baseline is
  supplied, and diagnostic value.
- Human output prioritizes the next investigation target; `--json` emits a validated machine-only
  artifact on stdout.
- Temporary conversion files are removed in `finally` blocks.

## 2. Make diagnosis one adaptive workflow

Make `flakelab diagnose` the primary product journey. It should accept either a deliberate test
target or an existing report through an explicit option, then orchestrate the cheapest useful next
step.

Acceptance criteria:

- A target starts with a bounded local scan; `--report <path>` starts with read-only report
  analysis.
- The command explains observed evidence before proposing cloud or AI work.
- It recommends the next experiment with bounded trial count, expected duration, required
  credentials, and an estimated Solari cost or a clear statement that no estimate is available.
- Local-only use always remains useful and never prompts for unrelated credentials.
- Solari or Groq work requires an explicit option or interactive confirmation immediately before
  the first chargeable operation.
- The final output includes a minimized reproducer and evidence report even when repair is skipped
  or rejected.
- Existing specialized commands remain narrow automation primitives, but ordinary users do not
  need to learn their sequencing.

## 3. Remove per-test integration friction

The causal workflow should not require every selected test to replace its `@playwright/test`
import. First investigate safe project-level integration through a generated temporary config,
the user's existing shared fixture, or a FlakeLab-controlled proxy.

Acceptance criteria:

- An ordinary existing Playwright suite can be scanned and taken through at least the core causal
  network experiments without per-test source edits.
- The integration preserves the user's projects, dependencies, web server, authentication setup,
  reporters, and application environment.
- Diagnosis never silently edits source or configuration.
- If one-time setup is technically necessary, `flakelab init` shows the exact proposed change,
  requires confirmation, makes one project-level reversible integration, and is idempotent.
- Do not use module-cache mutation, unsupported Playwright internals, or runtime monkey-patching.
- Existing `flakelab/playwright` integration remains only if it provides capabilities that cannot
  be delivered safely at project level; do not add compatibility aliases for obsolete paths.

## 4. Expand deterministic causal experiments

Network delay and request failure are too narrow for a generally useful flake debugger. Add fault
families only when they correspond to a common failure mode and can be applied, recorded,
minimized, and completely removed.

Implement in this order:

1. response ordering, duplication, truncation, and bounded status failures;
2. slow startup, hydration, scripts, and resource loading;
3. CPU pressure and bounded event-loop stalls;
4. expired or partially initialized authentication and browser storage;
5. clock jumps, timezone, and locale;
6. viewport, reduced motion, and animation speed; and
7. worker pressure and shared-state interference.

Current progress: bounded status failures, response truncation, response-tail duplication, response
reordering, ordered fault-set composition, numeric response minimization, portable replay, local
proxy execution, and browser/Solari adapters are implemented. The first response-fault group is
complete. Type-aware resource-loading delay isolates documents, scripts, stylesheets, images, and
fonts, while startup-event delay independently postpones application `DOMContentLoaded` or `load`
listeners. Both timing families report the observed edge and save a stability-margin reproducer.
The startup, hydration, script, and resource-loading group is complete. Bounded event-loop stalls
now reproduce missed main-thread deadlines from a deterministic offset after `DOMContentLoaded`,
discover and confirm the observed duration boundary, and save a stability-margin reproducer. The
CPU pressure and bounded event-loop group is complete. Expired or partially initialized
authentication and browser storage are complete too. Named cookies can be withheld from matched
requests without persisting their values, while a named local/session-storage entry can remain
temporarily invisible without deleting its value. Clock jumps, timezone, and locale are complete.
Wall-clock jumps preserve monotonic timer scheduling, while locale and timezone use Playwright's
browser-context configuration and validate their BCP 47 and IANA identifiers. Viewport, reduced
motion, and animation speed are complete. Viewports and reduced-motion preferences use native
Playwright context controls, while animation speed changes browser animation playback without
accelerating timers. Worker pressure and shared-state interference are complete. Worker pressure
finds the smallest supported Playwright worker count that exposes a failure; shared-state
interference overlaps repeated copies of the selected target to expose unsafe shared accounts,
records, files, ports, or other cross-test resources. Both remain runner-level faults and never
pretend to be browser or network mutations.
Unsupported remote proof and bisect combinations are rejected explicitly.

Public CLI validation on the event-loop fixture kept the baseline clean in 4/4 trials, found a
247 ms observed boundary, confirmed a 374 ms stability-margin trigger in 12/12 trials, and replayed
the saved artifact with the same failure signature in 12/12 independent trials.

Public CLI authentication validation kept the baseline clean in 4/4 trials, confirmed named-cookie
expiry in 12/12 trials, and reproduced the same signature in 12/12 independent replay trials.
Storage validation kept the baseline clean in 4/4 trials, found a 125 ms visibility boundary,
confirmed a 188 ms stability-margin trigger in 12/12 trials, and replayed the saved artifact with
the same signature in 12/12 independent trials. Neither artifact contains a cookie or storage
value.

Public CLI temporal validation kept every baseline clean. A one-hour clock jump 25 ms after page
startup, `fr-FR` locale, and `America/New_York` timezone each reproduced their distinct failure
signature in 12/12 confirmation trials and 12/12 independent replay trials. No provider credits
were used.

Public CLI visual-environment validation kept every baseline clean. A 375x667 viewport, reduced
motion, and 10x animation playback each reproduced a distinct failure signature in 12/12
confirmation trials and 12/12 independent replay trials. No provider credits were used.

Public CLI runner-interference validation kept both baselines clean in 4/4 trials. Discovery found
the minimum two-worker trigger and the minimum two-copy shared-state trigger, confirmed each in
12/12 trials, and replayed each in 12/12 independent trials with matching failure signatures.
Saved diagnostics used project-relative paths, and no provider credits were used.

Acceptance criteria:

- Every fault has a strict schema, deterministic seed or value, safe bound, and stable artifact
  representation.
- Faults are composable and the minimizer can remove irrelevant faults and shrink numeric values.
- Every fault has a control comparison and cannot be declared causal from a failing run alone.
- Cleanup is proven on pass, failure, timeout, cancellation, and provider error.
- The investigator receives compact objective results rather than raw sensitive logs.
- Faults that require unsupported or unsafe integration are explicitly deferred instead of
  approximated misleadingly.

## 5. Add checkpointing, resume, and cost control

An expensive diagnosis must survive interruption and make its resource use understandable before
it starts.

Acceptance criteria:

- Persist a validated run state after each completed phase using the one current schema.
- `flakelab resume <run-path>` continues from the next safe phase without repeating confirmed work.
- Cache keys include every input that affects prepared environments or experiment results.
- Reuse Solari snapshots when the cache key matches and explain every cache hit or miss.
- Show planned and actual trials, wall time, provider usage, Solari resources, and cleanup status.
- Cancellation stops scheduling new work, terminates local descendants, and releases remote
  resources.
- A partially completed run remains readable and never masquerades as a completed conclusion.

Current progress: checkpointing, resume, and cost control are complete. Diagnosis now atomically
persists one validated current-schema checkpoint after every confirmed phase and on interruption or
failure. `flakelab resume <diagnose.json>` validates the original input hash, confines saved paths,
and continues at the next safe phase without rerunning confirmed work. The human summary and
checkpoint distinguish planned work from cumulative executions and wall time, include AI tokens
and estimated cost, count Solari sandboxes created and released, and retain explicit cache and
cleanup status. Repair candidate generation honors `--max-cost` before isolated proof proceeds.

Solari demo snapshots now use a preparation key covering the commit, lockfile, fixture, template,
runtime command, application directory, port, and timeout; metrics explain each exact-key hit or
miss. Unique patched repair workspaces are deliberately uncached and say why. Local cancellation
coverage proves that new trials stop and descendant Playwright processes terminate. Remote paths
receive the same abort signal and release resources in `finally`; the local completion gate did not
make a billable provider call.

Validation: typecheck, zero-warning type-aware lint, 19 focused checkpoint/cache/usage/repair tests,
168 complete local tests, production build, packed-file dry run, a public CLI diagnose/resume smoke
test that retained exactly two executions, and secret scans all passed on 2026-09-05.

## 6. Turn evidence into the next developer action

The report and CI output should make reproduction and remediation immediate rather than merely
describing the investigation.

Acceptance criteria:

- Each causal claim links to the experiment, representative trace or recording, and control that
  supports it.
- The report compares one representative passing and failing run and presents the minimized fault
  configuration.
- Developers can copy an exact replay command and see which files and source locations informed a
  repair hypothesis.
- The proof matrix clearly separates hostile trials, clean controls, nearby regressions, and
  static checks.
- Generate a concise Markdown summary suitable for a GitHub job summary or pull request without
  exposing credentials, absolute paths, or full logs.
- Extend the existing GitHub Action to analyze blob reports and distinguish new failure signatures
  from a supplied artifact-backed baseline without requiring a hosted database.

Current progress: actionable evidence is complete. Every report-level causal claim now links to its
cited intervention and clean-control experiments. Bounded investigations retain project-relative
Playwright traces, and the report compares representative passing and failing runs while linking
the recordings from the experiment table. The minimized configuration has an exact replay command;
the source-context list and candidate edit line numbers show precisely what informed remediation.
The existing proof matrix continues to separate before/after hostile runs, clean control, nearby
regressions, and static checks.

GitHub summaries now include the replay command and source locations without raw logs, credentials,
or absolute paths. The composite action also supports a credential-free `blob-report` mode with an
optional artifact-backed `baseline`: it analyzes existing sharded evidence, identifies new failure
signatures, uploads the analysis and retained Playwright artifacts, and writes a concise Markdown
summary without a hosted database.

Validation: typecheck, zero-warning type-aware lint, 14 focused report/trace/CI tests, 170 complete
local tests, production build, packed-file dry run, and secret scans all passed on 2026-09-05. The
trace check exercised the real Playwright reporter and verified that its retained path is portable.
No provider credits were used.

## 7. Prove adoption on an unfamiliar repository

Dogfood the packed production artifact against at least one Playwright repository that FlakeLab did
not create. Do not add repository-specific exceptions merely to make the exercise pass.

Acceptance criteria:

- Install the exact tarball in a fresh consumer and run help, version, doctor, report analysis, a
  bounded scan, and one causal investigation.
- Exercise an existing custom fixture, authentication setup, web server, multiple projects,
  attachments, and paths containing spaces where the chosen repository supports them.
- Verify interruption and cleanup locally and, with explicit authorization, in Solari.
- Record setup time, time to first useful answer, experiment time, cloud usage, and every manual
  workaround; fix high-friction product problems before presentation polish.
- Scan every packed file and public artifact for secrets and sensitive paths.
- Review the complete diff and package contents before requesting approval to commit, push,
  publish, or post publicly.

Current progress: adoption proof is complete against Microsoft's public `sample-webapp` in a fresh
consumer directory named `consumer with spaces`. The exact 328,224-byte production tarball was
installed and exercised through help, version, doctor, credential-free blob-report analysis, a
two-repetition scan, causal discovery, bounded cancellation, cleanup, and independent replay. The
repository's authentication setup and its dependent `setup`, `chromium`, and `login-tests`
projects remained intact. Failure evidence retained Playwright's `error-context.md` attachment.
The repository did not contain a custom fixture or an enabled `webServer`, so those two cases were
not applicable; its application server was started separately as the only runtime workaround.

Measured on 2026-09-05/06: clone-to-first-useful-analysis was 7 minutes 36 seconds, including the
consumer's dependency install and one interactive `pnpm approve-builds` step. The bounded scan took
17 seconds. The successful causal search ran 50 executions in about 24 minutes: clean control 2/2,
then a minimum 20-byte JavaScript response truncation confirmed failures in 12/12 trials with an
80% lower confidence bound of 88%. Independent replay reproduced the same failure signature in
12/12 trials at concurrency four. An earlier broad network-delay hypothesis was stopped after
about 35 minutes because project dependency fan-out made it low-value. Cloud usage was zero AI
tokens, $0, and zero Solari sandboxes.

Dogfooding found and fixed two release-blocking usability problems without repository-specific
exceptions. Generated Playwright bridges now import a same-directory config path, so Windows
paths containing spaces no longer fail through percent-encoded `file:` URLs. Discovery now prints
each completed trial to stderr and has a five-minute default elapsed-time ceiling configurable via
`--max-seconds`. A one-second packed-artifact check ended with an actionable timeout, zero child
Playwright processes, and zero temporary bridge files. The final tarball passed the full causal
replay after those fixes.

Final validation: typecheck, zero-warning type-aware lint, eight focused adoption and CI tests, all 172
local tests, production build, exact-tarball install and replay, and package dry-run passed on
2026-09-06. Secret scanning covered all 305 packed members, all 158 changed files, and the six
public roadmap/dogfood artifacts with zero findings. Changed source and test files remain within
the 500-line limit. No provider credits were used. The complete diff was reviewed; only Git's
existing Windows line-ending advisories remain.

## Post-roadmap hardening

Three review findings are now addressed without broadening the product surface. Deterministic
discovery accepts a noisy control only when matched-seed, alternating control/intervention pairs
show that the intervention amplifies the same failure signature with separated 80% confidence
bounds. Every candidate and confirmation batch has distinct trial and artifact identities.

Proof now transports the complete validated reproducer fault set to Solari, and `prove` exposes the
same fault controls as `discover`. Nearby regression proof recursively covers `.spec` and `.test`
variants beside both the selected test and edited application files, with an explicit 50-file
ceiling. Repair can also receive up to seven repeatable `--source` paths; those files pass the same
project-boundary, extension, size, and credential checks as imported source context. Failure text
does not implicitly authorize reading or transmitting arbitrary source paths.

Validation: typecheck, zero-warning type-aware lint, 68 focused tests, all 178 local tests,
production build, package dry-run, a local hostile `worker-pressure` proof-runner smoke test, diff
checks, file-size checks, and secret scans of every touched file passed on 2026-09-06. No Groq or
Solari credits were used.

Terminal output now uses one TTY-aware presentation layer with semantic statuses, bounded wrapping,
safe ANSI handling, command-specific help, line-oriented progress, and unchanged machine-readable
stdout. Interactive report generation offers to open the portable offline HTML in the default
browser; `--open` accepts immediately, while CI and redirected sessions never prompt or launch a
browser implicitly. No local server or background process is required.

The same pass hardened parallel verification: generated `.flakelab-<uuid>.config.ts` bridges are
narrowly ignored by Git and ESLint, representative failure evidence retains distinct attachment
types instead of duplicate screenshots, and the longest sequential runner test is split without
removing assertions. Validation: typecheck, zero-warning lint, 31 focused UI/report tests, all 193
tests under the normal four-worker configuration, production build, and package dry-run passed on
2026-09-06. No provider credits were used.

## Execution order

- [x] Analyze existing Playwright CI reports.
- [x] Make diagnosis one adaptive workflow.
- [x] Remove per-test integration friction.
- [x] Expand deterministic causal experiments.
- [x] Add checkpointing, resume, and cost control.
- [x] Turn evidence into the next developer action.
- [x] Prove adoption on an unfamiliar repository.

Complete one milestone at a time. Each implementation milestone requires typecheck, lint, focused
tests, the complete local test suite, build verification, secret scanning, and a diff review before
moving to the next.

Do not add providers, dashboards, hosted services, schema versions, compatibility layers, or more
Solari products merely to broaden the feature list. Judge every change by how much easier it makes
a real failure to understand, reproduce, and fix.
