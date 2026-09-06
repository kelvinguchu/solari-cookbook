import { expect, test } from "@playwright/test"

import { doctor } from "../../src/commands/doctor.js"

test("doctor reports readiness without exposing credential values", async () => {
  let output = ""
  await doctor({
    environment: {
      GROQ_API_KEY: "credential-value-that-must-not-be-printed",
    },
    loadEnvironmentFile: false,
    write: (message) => {
      output += message
    },
  })

  expect(output).toContain("FlakeLab · doctor")
  expect(output).toContain("GROQ_API_KEY · configured via environment")
  expect(output).toContain("SOLARI_API_KEY · optional for local scans")
  expect(output).toContain("Credential isolation")
  expect(output).not.toContain("credential-value-that-must-not-be-printed")
})
