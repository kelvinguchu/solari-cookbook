import { existsSync } from "node:fs"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import type { EvidenceReport } from "./schema.js"

const CLIENT_SCRIPT = "report-client.js"
const CLIENT_STYLES = "report-client.css"

function escapeEmbeddedJson(value: EvidenceReport): string {
  return JSON.stringify(value)
    .replaceAll("<", String.raw`\u003c`)
    .replaceAll(">", String.raw`\u003e`)
    .replaceAll("&", String.raw`\u0026`)
    .replaceAll("\u2028", String.raw`\u2028`)
    .replaceAll("\u2029", String.raw`\u2029`)
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function htmlDocument(report: EvidenceReport, script: string, styles: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'">
  <title>FlakeLab · ${escapeHtml(report.test)}</title>
  <style>${styles}</style>
</head>
<body>
  <div id="root"></div>
  <script id="flakelab-report" type="application/json">${escapeEmbeddedJson(report)}</script>
  <script type="module">${script.replaceAll("</script", String.raw`<\/script`)}</script>
</body>
</html>
`
}

async function readClientAsset(projectRoot: string, name: string): Promise<string> {
  const installedPath = fileURLToPath(new URL(`./${name}`, import.meta.url))
  const assetPath = existsSync(installedPath)
    ? installedPath
    : resolve(projectRoot, "dist", "report", name)
  return readFile(assetPath, "utf8")
}

export async function writePortableReport(
  projectRoot: string,
  outputPath: string,
  report: EvidenceReport,
): Promise<void> {
  const [script, styles] = await Promise.all([
    readClientAsset(projectRoot, CLIENT_SCRIPT),
    readClientAsset(projectRoot, CLIENT_STYLES),
  ])
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, htmlDocument(report, script, styles), "utf8")
}
