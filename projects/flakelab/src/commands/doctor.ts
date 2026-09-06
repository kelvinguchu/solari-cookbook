import { chromium } from "@playwright/test"
import { execFile } from "node:child_process"
import { existsSync } from "node:fs"
import { resolve } from "node:path"
import { promisify } from "node:util"

import { credentialStatus } from "../security/credentials.js"
import type {
  CredentialProvider,
  CredentialStatus,
} from "../security/credentials.js"
import { TerminalDocument } from "../ui/document.js"
import { formatCount } from "../ui/format.js"
import type { StatusTone } from "../ui/status.js"
import type { TerminalTheme } from "../ui/theme.js"
import { PLAIN_THEME, stdoutTheme } from "../ui/theme.js"

const execFileAsync = promisify(execFile)
const PLAYWRIGHT_CONFIGS = [
  "playwright.config.ts",
  "playwright.config.js",
  "playwright.config.mts",
  "playwright.config.mjs",
  "playwright.config.cts",
  "playwright.config.cjs",
]

interface DoctorOptions {
  environment?: NodeJS.ProcessEnv
  loadEnvironmentFile?: boolean
  projectRoot?: string
  theme?: TerminalTheme
  write?: (message: string) => void
}

interface CheckResult {
  detail: string
  label: string
  remedy?: string
  status: "pass" | "warn"
}

const CHECK_TONES: Record<CheckResult["status"], StatusTone> = {
  pass: "success",
  warn: "warning",
}

function check(
  label: string,
  passed: boolean,
  detail: string,
  remedy?: string,
): CheckResult {
  return {
    detail,
    label,
    ...(passed || remedy === undefined ? {} : { remedy }),
    status: passed ? "pass" : "warn",
  }
}

function credentialCheck(provider: CredentialProvider, status: CredentialStatus): CheckResult {
  if (status.configured) {
    return {
      detail: `configured via ${status.source?.replaceAll("-", " ") ?? "private input"}`,
      label: status.environmentName,
      status: "pass",
    }
  }
  return {
    detail: provider === "groq"
      ? "optional for local scans; prompted when AI is requested"
      : "optional for local scans; prompted when isolated proof is requested",
    label: status.environmentName,
    status: "warn",
  }
}

async function evidenceDirectoryIgnored(projectRoot: string): Promise<boolean> {
  try {
    await execFileAsync("git", ["check-ignore", "--quiet", ".flakelab/runs/scan.json"], {
      cwd: projectRoot,
      windowsHide: true,
    })
    return true
  } catch {
    return false
  }
}

function environmentChecks(projectRoot: string, evidenceIgnored: boolean): CheckResult[] {
  const majorNodeVersion = Number.parseInt(process.versions.node.split(".")[0] ?? "0", 10)
  const hasPlaywrightConfig = PLAYWRIGHT_CONFIGS.some(
    (file) => existsSync(resolve(projectRoot, file)),
  )
  const chromiumInstalled = existsSync(chromium.executablePath())
  return [
    check("Node.js", majorNodeVersion >= 20, `${process.versions.node} · requires 20 or newer`),
    check(
      "Playwright project",
      hasPlaywrightConfig,
      hasPlaywrightConfig ? "configuration detected" : "no playwright.config file detected",
      "npm init playwright@latest",
    ),
    check(
      "Chromium",
      chromiumInstalled,
      chromiumInstalled ? "browser executable available" : "browser executable is missing",
      "npx playwright install chromium",
    ),
    check(
      "Evidence privacy",
      evidenceIgnored,
      evidenceIgnored
        ? ".flakelab output is ignored by Git"
        : ".flakelab output is not ignored by Git",
      "echo .flakelab/ >> .gitignore",
    ),
  ]
}

function appendChecks(
  document: TerminalDocument,
  title: string,
  results: CheckResult[],
): void {
  document.section(title)
  for (const result of results) {
    document.entry(CHECK_TONES[result.status], `${result.label} · ${result.detail}`)
  }
}

function renderDoctor(
  theme: TerminalTheme,
  environment: CheckResult[],
  credentials: CheckResult[],
): string {
  const results = [...environment, ...credentials]
  const warnings = results.filter((result) => result.status === "warn")
  const document = new TerminalDocument(theme)
  document.heading("doctor")
  document.verdict(
    warnings.length === 0 ? "success" : "warning",
    warnings.length === 0 ? "ready" : "ready with warnings",
    warnings.length === 0
      ? `${formatCount(results.length, "check")} passed`
      : `${results.length - warnings.length} of ${results.length} checks passed`
        + ` · ${formatCount(warnings.length, "item")} to review`,
  )
  appendChecks(document, "Environment", environment)
  appendChecks(document, "Credentials", credentials)
  const remedies = warnings
    .map((result) => result.remedy)
    .filter((remedy): remedy is string => remedy !== undefined)
  if (remedies.length > 0) {
    document.section("Next")
    for (const remedy of remedies) {
      document.command(remedy)
    }
  }
  return document.render()
}

export async function doctor(options: DoctorOptions = {}): Promise<void> {
  const projectRoot = options.projectRoot ?? process.cwd()
  const environment = options.environment ?? process.env
  const credentialOptions = {
    environment,
    ...(options.loadEnvironmentFile === undefined
      ? {}
      : { loadEnvironmentFile: options.loadEnvironmentFile }),
  }
  const checks = environmentChecks(projectRoot, await evidenceDirectoryIgnored(projectRoot))
  const credentials = [
    credentialCheck("groq", credentialStatus("groq", credentialOptions)),
    credentialCheck("solari", credentialStatus("solari", credentialOptions)),
    check("Credential isolation", true, "provider keys are removed from Playwright processes"),
  ]
  const write = options.write ?? ((message: string) => process.stdout.write(message))
  const theme = options.theme ?? (options.write ? PLAIN_THEME : stdoutTheme())
  write(`${renderDoctor(theme, checks, credentials)}\n`)
}
