export function compileUrlPattern(pattern: string): RegExp {
  if (/[{}]/u.test(pattern)) {
    throw new Error("Fault patterns currently support *, **, and ? wildcards")
  }
  let expression = ""
  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index]
    if (character === "*" && pattern[index + 1] === "*") {
      expression += ".*"
      index += 1
    } else if (character === "*") {
      expression += "[^/]*"
    } else if (character === "?") {
      expression += "."
    } else {
      expression += character.replace(/[\\^$.*+?()[\]|]/gu, "\\$&")
    }
  }
  return new RegExp(`^${expression}$`, "u")
}
