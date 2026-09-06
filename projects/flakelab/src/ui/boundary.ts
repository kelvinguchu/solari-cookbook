import type { DocumentRow } from "./document.js"
import { TerminalDocument } from "./document.js"
import type { TerminalTheme } from "./theme.js"
import { PLAIN_THEME } from "./theme.js"

export interface ProviderBoundary {
  /** Extra facts a reader needs before authorizing the work, such as a model. */
  rows?: DocumentRow[]
  credentials: string[]
  /** What leaves the machine, in one sentence. */
  detail: string
  stage: string
}

/**
 * The one place FlakeLab announces that the next step leaves the local machine.
 * It always names the work, what is transmitted, the credentials in use, and the
 * ceilings that bound it, so the cost and security boundary is visible before a
 * chargeable operation starts.
 */
export function formatProviderBoundary(
  boundary: ProviderBoundary,
  theme: TerminalTheme = PLAIN_THEME,
): string {
  const document = new TerminalDocument(theme)
  document.entry("warning", `provider work · ${boundary.stage}`, boundary.detail)
  const rows: DocumentRow[] = [
    { label: "Credentials", value: boundary.credentials.join(" · ") || "none" },
    ...(boundary.rows ?? []),
  ]
  return document.rows(rows).render()
}
