import type { Fault } from "../domain/schema.js"
import { isBrowserContextFault } from "../faults/browser-context.js"
import { isDocumentBootstrapFault } from "../faults/document-bootstrap.js"
import type { ExperimentCondition } from "./schema.js"

function faultPattern(fault: Fault, requestPattern: string, test: string): string {
  if (fault.kind === "worker-pressure" || fault.kind === "shared-state-interference") {
    return test
  }
  if (
    isBrowserContextFault(fault)
    || isDocumentBootstrapFault(fault)
    || fault.kind === "resource-loading-delay"
  ) {
    return "**"
  }
  return requestPattern
}

export function conditionToFaults(
  condition: ExperimentCondition,
  requestPattern: string,
  test: string,
): Fault[] {
  if (condition.kind === "baseline") {
    return []
  }
  const fault: Fault = { ...condition, pattern: requestPattern }
  return [{ ...fault, pattern: faultPattern(fault, requestPattern, test) }]
}
