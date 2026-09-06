import { requireCredential } from "../security/credentials.js"
import type { CredentialProvider } from "../security/credentials.js"

type CredentialRequester = (
  provider: CredentialProvider,
  forcePrompt: boolean,
) => Promise<string>

async function requestCredential(
  provider: CredentialProvider,
  forcePrompt: boolean,
): Promise<string> {
  return requireCredential(provider, { forcePrompt })
}

export async function preflightProofCredentials(
  forcePrompt: boolean,
  request: CredentialRequester = requestCredential,
): Promise<void> {
  await request("groq", forcePrompt)
  await request("solari", forcePrompt)
}
