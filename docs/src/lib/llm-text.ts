import { readFile } from "node:fs/promises"
import { join } from "node:path"

import type { InferPageType } from "fumadocs-core/source"

import { siteUrl } from "@/lib/site"
import type { source } from "@/lib/source"

type DocsPage = InferPageType<typeof source>

const CONTENT_ROOT = join(process.cwd(), "content", "docs")

/**
 * Reads one content file. The path is rebuilt from a statically scoped root so
 * the bundler traces `content/docs` rather than the whole project.
 */
async function readContentFile(relativePath: string): Promise<string> {
  return readFile(join(CONTENT_ROOT, relativePath), "utf8")
}

/** Removes the YAML frontmatter block that opens every content file. */
function stripFrontmatter(raw: string): string {
  if (!raw.startsWith("---")) {
    return raw
  }
  const end = raw.indexOf("\n---", 3)
  return end === -1 ? raw : raw.slice(end + 4).replace(/^\r?\n/, "")
}

/**
 * Renders one page as standalone Markdown for an LLM: a title, the canonical
 * URL so an agent can cite it, the description, then the authored body.
 */
export async function getLLMText(page: DocsPage): Promise<string> {
  const raw = await readContentFile(page.path)
  const description = page.data.description

  return [
    `# ${page.data.title}`,
    `URL: ${siteUrl}${page.url}`,
    description ? `\n${description}` : "",
    "",
    stripFrontmatter(raw).trim(),
    "",
  ]
    .filter((part) => part !== "")
    .join("\n")
}
