const ESCAPE = 0x1b
const TAB = 0x09
const LINE_FEED = 0x0a

/**
 * Zero-width, bidirectional-override, and byte-order characters. They carry no
 * information in a terminal report but can reorder or hide rendered text.
 */
const INVISIBLE_CODE_POINTS = new Set([
  0x200b, 0x200c, 0x200d, 0x200e, 0x200f,
  0x202a, 0x202b, 0x202c, 0x202d, 0x202e,
  0x2060, 0x2061, 0x2062, 0x2063, 0x2064,
  0x2066, 0x2067, 0x2068, 0x2069,
  0xfeff,
])

function unsafeCodePoint(code: number): boolean {
  return code < 0x20 || (code >= 0x7f && code <= 0x9f) || INVISIBLE_CODE_POINTS.has(code)
}

function alphabetic(character: string | undefined): boolean {
  if (character === undefined) {
    return false
  }
  const code = character.codePointAt(0) ?? 0
  return (code >= 0x41 && code <= 0x5a) || (code >= 0x61 && code <= 0x7a)
}

function escapeSequenceEnd(value: string, start: number): number {
  let index = start + 1
  if (value[index] !== "[") {
    return index
  }
  index += 1
  while (index < value.length && !alphabetic(value[index])) {
    index += 1
  }
  return index + 1
}

/** Removes ANSI select-graphic-rendition and other CSI sequences. */
export function stripAnsi(value: string): string {
  let result = ""
  let index = 0
  while (index < value.length) {
    if (value.codePointAt(index) === ESCAPE) {
      index = escapeSequenceEnd(value, index)
      continue
    }
    result += value[index]
    index += 1
  }
  return result
}

/**
 * Makes an untrusted value safe to print: escape sequences, cursor controls, and
 * invisible reordering characters cannot survive. Newlines are preserved.
 */
export function sanitizeText(value: string): string {
  let result = ""
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (code === TAB) {
      result += " "
    } else if (code === LINE_FEED) {
      result += "\n"
    } else if (!unsafeCodePoint(code)) {
      result += character
    }
  }
  return result
}

/** Collapses an untrusted value into one safe, single-line string. */
export function sanitizeLine(value: string): string {
  return sanitizeText(value)
    .split("\n")
    .join(" ")
    .split(" ")
    .filter((part) => part.length > 0)
    .join(" ")
}

export function displayWidth(value: string): number {
  return [...stripAnsi(value)].length
}

export function padRight(value: string, width: number): string {
  const padding = width - displayWidth(value)
  return padding > 0 ? `${value}${" ".repeat(padding)}` : value
}

export function truncate(value: string, maximum: number): string {
  const characters = [...value]
  if (characters.length <= maximum || maximum < 2) {
    return value
  }
  return `${characters.slice(0, maximum - 1).join("")}…`
}

function wrapParagraph(paragraph: string, limit: number): string[] {
  const words = paragraph.split(" ").filter((word) => word.length > 0)
  if (words.length === 0) {
    return [""]
  }
  const lines: string[] = []
  let current = ""
  for (const word of words) {
    if (current === "") {
      current = word
    } else if (displayWidth(current) + 1 + displayWidth(word) <= limit) {
      current = `${current} ${word}`
    } else {
      lines.push(current)
      current = word
    }
  }
  lines.push(current)
  return lines
}

/**
 * Wraps on word boundaries only. A long path or identifier is never broken, so
 * every printed value stays selectable and copyable.
 */
export function wrapText(value: string, width: number): string[] {
  const limit = Math.max(width, 16)
  return value.split("\n").flatMap((paragraph) => wrapParagraph(paragraph, limit))
}
