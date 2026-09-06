"use client"

import { useState } from "react"

interface CopyCommandProps {
  command: string
}

/** A copyable shell line. The `$` is decorative and never part of the copy. */
export function CopyCommand({ command }: CopyCommandProps) {
  const [copied, setCopied] = useState(false)

  const copy = () => {
    navigator.clipboard.writeText(command).then(
      () => {
        setCopied(true)
        window.setTimeout(() => {
          setCopied(false)
        }, 2000)
      },
      () => {
        setCopied(false)
      },
    )
  }

  return (
    <button
      aria-label={`Copy command: ${command}`}
      className="group flex w-full max-w-xl items-center gap-2 border border-fd-border
        bg-fd-card px-3 py-3 text-left text-xs transition-colors
        hover:border-fd-ring focus-visible:outline-2 focus-visible:outline-offset-2
        focus-visible:outline-fd-ring sm:gap-3 sm:px-4 sm:text-[0.8125rem]"
      onClick={copy}
      type="button"
    >
      <span aria-hidden className="shrink-0 text-fd-muted-foreground">$</span>
      <code className="flex-1 truncate bg-transparent p-0 text-fd-foreground">
        {command}
      </code>
      <span
        aria-hidden
        className="shrink-0 text-xs text-fd-muted-foreground transition-colors
          group-hover:text-fd-foreground"
      >
        {copied ? "copied ✓" : "⧉"}
      </span>
    </button>
  )
}
