import { mkdir, writeFile } from "node:fs/promises"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"

import { build } from "vite"

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..")
const outputDirectory = resolve(projectRoot, "dist", "report")
const entryPath = resolve(projectRoot, "src", "report", "browser-entry.tsx")

/** Large enough to force the Geist Mono font into the stylesheet as a data URI. */
const maxInlineAssetBytes = 16 * 1_024 * 1_024

const result = await build({
  configFile: false,
  logLevel: "silent",
  root: projectRoot,
  build: {
    assetsInlineLimit: maxInlineAssetBytes,
    cssCodeSplit: false,
    minify: true,
    write: false,
    rollupOptions: {
      input: entryPath,
    },
  },
})

const outputs = Array.isArray(result) ? result : [result]
const entries = outputs.flatMap((output) => "output" in output ? output.output : [])
const script = entries.find((entry) => entry.type === "chunk" && entry.isEntry)
const stylesheet = entries.find((entry) =>
  entry.type === "asset" && entry.fileName.endsWith(".css"))
if (script?.type !== "chunk") {
  throw new Error("Vite did not produce the FlakeLab report script")
}
if (stylesheet?.type !== "asset") {
  throw new Error("Vite did not produce the FlakeLab report stylesheet")
}
const detached = entries.filter((entry) =>
  entry.type === "asset" && !entry.fileName.endsWith(".css"))
if (detached.length > 0) {
  const names = detached.map((entry) => entry.fileName).join(", ")
  throw new Error(`Report assets must be inlined to stay portable: ${names}`)
}

await mkdir(outputDirectory, { recursive: true })
await Promise.all([
  writeFile(resolve(outputDirectory, "report-client.js"), script.code, "utf8"),
  writeFile(resolve(outputDirectory, "report-client.css"), stylesheet.source, "utf8"),
])
