export interface ModelGenerationUsage {
  inputTokens: number
  outputTokens: number
}

export class RecoverableGenerationError extends Error {
  readonly generatedText: string | undefined
  readonly usage: ModelGenerationUsage

  constructor(
    message: string,
    generatedText: string | undefined,
    usage: ModelGenerationUsage,
  ) {
    super(message)
    this.name = "RecoverableGenerationError"
    this.generatedText = generatedText
    this.usage = usage
  }
}

export function schemaCorrectionPrompt(
  initialPrompt: string,
  failure: RecoverableGenerationError,
  requirements: string,
): string {
  const generated = failure.generatedText?.slice(0, 4_000) ?? "(provider output unavailable)"
  return [
    initialPrompt,
    "Your previous JSON response did not match the required output schema.",
    `Schema error: ${failure.message}`,
    `Required shape: ${requirements}`,
    "Previous invalid JSON:",
    generated,
    "Return only one corrected JSON object.",
  ].join("\n")
}
