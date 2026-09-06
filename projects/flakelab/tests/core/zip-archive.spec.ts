import { expect, test } from "@playwright/test"
import { writeFile } from "node:fs/promises"

import { inspectZipArchive } from "../../src/analysis/zip-archive.js"

interface ZipOptions {
  expandedSize?: number
  localName?: string
  symbolicLink?: boolean
}

function minimalZip(name: string, options: ZipOptions = {}): Buffer {
  const nameBuffer = Buffer.from(name)
  const localNameBuffer = Buffer.from(options.localName ?? name)
  const expandedSize = options.expandedSize ?? 0
  const local = Buffer.alloc(30 + localNameBuffer.length)
  local.writeUInt32LE(0x04034b50, 0)
  local.writeUInt16LE(20, 4)
  local.writeUInt16LE(0x0800, 6)
  local.writeUInt32LE(expandedSize, 22)
  local.writeUInt16LE(localNameBuffer.length, 26)
  localNameBuffer.copy(local, 30)

  const central = Buffer.alloc(46 + nameBuffer.length)
  central.writeUInt32LE(0x02014b50, 0)
  central.writeUInt16LE((3 << 8) | 20, 4)
  central.writeUInt16LE(20, 6)
  central.writeUInt16LE(0x0800, 8)
  central.writeUInt32LE(expandedSize, 24)
  central.writeUInt16LE(nameBuffer.length, 28)
  if (options.symbolicLink) {
    central.writeUInt32LE((0o120777 << 16) >>> 0, 38)
  }
  nameBuffer.copy(central, 46)

  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(1, 8)
  end.writeUInt16LE(1, 10)
  end.writeUInt32LE(central.length, 12)
  end.writeUInt32LE(local.length, 16)
  return Buffer.concat([local, central, end])
}

test("ZIP inspection accepts a bounded regular archive", async ({
  browserName: _browserName,
}, testInfo) => {
  const path = testInfo.outputPath("blob.zip")
  await writeFile(path, minimalZip("report.jsonl"))

  await expect(inspectZipArchive(path)).resolves.toEqual({
    compressedBytes: 0,
    entries: 1,
    expandedBytes: 0,
  })
})

test("ZIP inspection rejects traversal, links, and excessive expansion", async ({
  browserName: _browserName,
}, testInfo) => {
  const traversal = testInfo.outputPath("traversal.zip")
  const localTraversal = testInfo.outputPath("local-traversal.zip")
  const link = testInfo.outputPath("link.zip")
  const oversized = testInfo.outputPath("oversized.zip")
  await Promise.all([
    writeFile(traversal, minimalZip("../outside.txt")),
    writeFile(localTraversal, minimalZip("report.jsonl", { localName: "../outside.txt" })),
    writeFile(link, minimalZip("report-link", { symbolicLink: true })),
    writeFile(oversized, minimalZip("report.jsonl", { expandedSize: 513 * 1_024 * 1_024 })),
  ])

  await expect(inspectZipArchive(traversal)).rejects.toThrow("Unsafe path")
  await expect(inspectZipArchive(localTraversal)).rejects.toThrow("Unsafe path")
  await expect(inspectZipArchive(link)).rejects.toThrow("Symbolic links are not allowed")
  await expect(inspectZipArchive(oversized)).rejects.toThrow("512 MiB safety limit")
})
