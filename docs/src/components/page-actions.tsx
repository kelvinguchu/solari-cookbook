"use client"

import { useState } from "react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "fumadocs-ui/components/ui/popover"

const ACTION = "inline-flex items-center gap-2 border border-fd-border px-2.5 py-1.5 "
  + "text-xs transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground "
  + "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-fd-ring"

const ROW = "flex w-full items-center justify-between gap-6 px-3 py-2 text-left text-xs "
  + "transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground "
  + "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-fd-ring"

interface PageActionsProps {
  githubUrl: string
  /** Absolute URL of the plain-Markdown rendering of this page. */
  markdownUrl: string
}

interface WebAgent {
  href: (prompt: string) => string
  label: string
  vendor: string
}

interface TerminalAgent {
  command: (markdownUrl: string) => string
  label: string
  vendor: string
}

/**
 * Chat surfaces that accept a pre-filled first message through a query
 * parameter. Gemini is deliberately absent: it has no supported prefill
 * parameter, and a link that silently drops the prompt is worse than no link.
 */
const WEB_AGENTS: WebAgent[] = [
  {
    href: (prompt) => `https://chatgpt.com/?hints=search&q=${prompt}`,
    label: "ChatGPT",
    vendor: "OpenAI",
  },
  {
    href: (prompt) => `https://claude.ai/new?q=${prompt}`,
    label: "Claude",
    vendor: "Anthropic",
  },
  {
    href: (prompt) => `https://grok.com/?q=${prompt}`,
    label: "Grok",
    vendor: "xAI",
  },
  {
    href: (prompt) => `https://www.perplexity.ai/search?q=${prompt}`,
    label: "Perplexity",
    vendor: "Perplexity",
  },
  {
    href: (prompt) => `https://t3.chat/new?q=${prompt}`,
    label: "T3 Chat",
    vendor: "T3",
  },
]

/**
 * Coding agents that run in a terminal. They cannot be deep-linked, so each
 * entry copies a ready-to-paste command instead of opening a URL.
 */
const TERMINAL_AGENTS: TerminalAgent[] = [
  {
    command: (url) => `claude "Read ${url} and help me apply it to my Playwright suite."`,
    label: "Claude Code",
    vendor: "Anthropic",
  },
  {
    command: (url) => `codex "Read ${url} and help me apply it to my Playwright suite."`,
    label: "Codex",
    vendor: "OpenAI",
  },
  {
    command: (url) => `gemini "Read ${url} and help me apply it to my Playwright suite."`,
    label: "Gemini CLI",
    vendor: "Google",
  },
  {
    command: (url) => `copilot -p "Read ${url} and help me apply it to my Playwright suite."`,
    label: "Copilot CLI",
    vendor: "GitHub",
  },
  {
    command: (url) => `cursor-agent "Read ${url} and help me apply it to my Playwright suite."`,
    label: "Cursor CLI",
    vendor: "Cursor",
  },
]

async function writeClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value)
    return true
  } catch {
    return false
  }
}

function SectionLabel({ children }: { children: string }) {
  return (
    <p className="fl-label px-3 pt-3 pb-1.5">{children}</p>
  )
}

/**
 * Page-level actions for both humans and agents: copy the page as Markdown,
 * open it in a hosted assistant, or copy a command that hands the Markdown URL
 * to a terminal coding agent.
 */
export function PageActions({ githubUrl, markdownUrl }: PageActionsProps) {
  const [copied, setCopied] = useState<string | null>(null)
  const prompt = encodeURIComponent(
    `Read ${markdownUrl} so I can ask questions about FlakeLab.`,
  )

  const flash = (key: string) => {
    setCopied(key)
    window.setTimeout(() => {
      setCopied((current) => (current === key ? null : current))
    }, 2000)
  }

  const copyPage = async () => {
    const response = await fetch(markdownUrl).catch(() => null)
    const text = response?.ok ? await response.text() : null
    if (text !== null && await writeClipboard(text)) {
      flash("page")
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 pb-6">
      <button
        className={ACTION}
        onClick={() => void copyPage()}
        type="button"
      >
        <span aria-hidden className="text-fd-muted-foreground">
          {copied === "page" ? "✓" : "⧉"}
        </span>
        {copied === "page" ? "Copied" : "Copy page"}
      </button>

      <Popover>
        <PopoverTrigger className={ACTION}>
          Open in
          <span aria-hidden className="text-fd-muted-foreground">▾</span>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-0">
          <SectionLabel>Assistants</SectionLabel>
          {WEB_AGENTS.map((agent) => (
            <a
              className={ROW}
              href={agent.href(prompt)}
              key={agent.label}
              rel="noreferrer noopener"
              target="_blank"
            >
              <span>{agent.label}</span>
              <span className="text-fd-muted-foreground">{agent.vendor} ↗</span>
            </a>
          ))}

          <div className="mt-2 border-t border-fd-border" />
          <SectionLabel>Coding agents · copy command</SectionLabel>
          {TERMINAL_AGENTS.map((agent) => (
            <button
              className={ROW}
              key={agent.label}
              onClick={() => {
                void writeClipboard(agent.command(markdownUrl)).then((ok) => {
                  if (ok) {
                    flash(agent.label)
                  }
                })
              }}
              type="button"
            >
              <span>{agent.label}</span>
              <span className="text-fd-muted-foreground">
                {copied === agent.label ? "copied ✓" : `${agent.vendor} ⧉`}
              </span>
            </button>
          ))}

          <div className="mt-2 border-t border-fd-border" />
          <SectionLabel>Source</SectionLabel>
          <a
            className={ROW}
            href={markdownUrl}
            rel="noreferrer noopener"
            target="_blank"
          >
            <span>View as Markdown</span>
            <span className="text-fd-muted-foreground">.mdx ↗</span>
          </a>
          <a
            className={`${ROW} mb-2`}
            href={githubUrl}
            rel="noreferrer noopener"
            target="_blank"
          >
            <span>Edit on GitHub</span>
            <span className="text-fd-muted-foreground">repo ↗</span>
          </a>
        </PopoverContent>
      </Popover>
    </div>
  )
}
