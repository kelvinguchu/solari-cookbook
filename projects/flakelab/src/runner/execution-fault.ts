import type { Fault } from "../domain/schema.js"

export type RunnerExecutionFault = Extract<Fault, {
  kind: "shared-state-interference" | "worker-pressure"
}>

export interface RunnerExecutionControls {
  arguments: string[]
  environment: NodeJS.ProcessEnv
}

export function isRunnerExecutionFault(fault: Fault): fault is RunnerExecutionFault {
  return fault.kind === "shared-state-interference" || fault.kind === "worker-pressure"
}

export function runnerExecutionControls(faults: readonly Fault[]): RunnerExecutionControls {
  const runnerFault = faults.find(isRunnerExecutionFault)
  if (!runnerFault) {
    return { arguments: ["--workers=1"], environment: {} }
  }
  if (runnerFault.kind === "worker-pressure") {
    return {
      arguments: [`--workers=${runnerFault.workers}`, "--fully-parallel"],
      environment: { FLAKELAB_WORKER_PRESSURE_ACTIVE: "1" },
    }
  }
  return {
    arguments: [
      `--workers=${runnerFault.copies}`,
      `--repeat-each=${runnerFault.copies}`,
      "--fully-parallel",
    ],
    environment: { FLAKELAB_SHARED_STATE_ACTIVE: "1" },
  }
}
