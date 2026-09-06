import { lstat, open } from "node:fs/promises"
import type { FileHandle } from "node:fs/promises"

const CENTRAL_DIRECTORY_SIGNATURE = 0x02014b50
const END_OF_DIRECTORY_SIGNATURE = 0x06054b50
const LOCAL_FILE_SIGNATURE = 0x04034b50
const MAX_ARCHIVE_BYTES = 128 * 1_024 * 1_024
const MAX_CENTRAL_DIRECTORY_BYTES = 16 * 1_024 * 1_024
const MAX_ENTRIES = 10_000
const MAX_EXPANDED_BYTES = 512 * 1_024 * 1_024
const MAX_ZIP_COMMENT_BYTES = 65_535
const ZIP64_SENTINEL_16 = 0xffff
const ZIP64_SENTINEL_32 = 0xffffffff

export interface ZipArchiveSummary {
  compressedBytes: number
  entries: number
  expandedBytes: number
}

interface EndOfDirectory {
  centralDirectoryOffset: number
  centralDirectorySize: number
  entries: number
  offset: number
}

interface CentralEntry {
  compressedSize: number
  compressionMethod: number
  entryLength: number
  expandedSize: number
  localHeaderOffset: number
  name: string
}

async function readExactly(
  file: FileHandle,
  position: number,
  length: number,
): Promise<Buffer> {
  const buffer = Buffer.alloc(length)
  const { bytesRead } = await file.read(buffer, 0, length, position)
  if (bytesRead !== length) {
    throw new Error("Blob report archive ended unexpectedly")
  }
  return buffer
}

function findEndOfDirectory(tail: Buffer, tailOffset: number): EndOfDirectory {
  for (let offset = tail.length - 22; offset >= 0; offset -= 1) {
    if (tail.readUInt32LE(offset) !== END_OF_DIRECTORY_SIGNATURE) {
      continue
    }
    const commentLength = tail.readUInt16LE(offset + 20)
    if (offset + 22 + commentLength !== tail.length) {
      continue
    }
    const disk = tail.readUInt16LE(offset + 4)
    const centralDisk = tail.readUInt16LE(offset + 6)
    const diskEntries = tail.readUInt16LE(offset + 8)
    const entries = tail.readUInt16LE(offset + 10)
    const centralDirectorySize = tail.readUInt32LE(offset + 12)
    const centralDirectoryOffset = tail.readUInt32LE(offset + 16)
    if (disk !== 0 || centralDisk !== 0 || diskEntries !== entries) {
      throw new Error("Multi-disk blob report archives are not supported")
    }
    if (
      entries === ZIP64_SENTINEL_16
      || centralDirectorySize === ZIP64_SENTINEL_32
      || centralDirectoryOffset === ZIP64_SENTINEL_32
    ) {
      throw new Error("ZIP64 blob report archives are not supported")
    }
    return {
      centralDirectoryOffset,
      centralDirectorySize,
      entries,
      offset: tailOffset + offset,
    }
  }
  throw new Error("Input is not a complete ZIP archive")
}

function validateEntryName(name: string): void {
  const normalized = name.replaceAll("\\", "/")
  const segments = normalized.split("/")
  if (
    !name
    || name.includes("\0")
    || normalized.startsWith("/")
    || /^[a-z]:\//iu.test(normalized)
    || segments.includes("..")
  ) {
    throw new Error(`Unsafe path in blob report archive: ${name || "<empty>"}`)
  }
}

function isSymbolicLink(directory: Buffer, offset: number): boolean {
  const hostSystem = directory.readUInt8(offset + 5)
  const unixMode = directory.readUInt32LE(offset + 38) >>> 16
  return hostSystem === 3 && (unixMode & 0o170000) === 0o120000
}

function assertSupportedEntry(
  flags: number,
  compressionMethod: number,
  compressedSize: number,
  expandedSize: number,
  localHeaderOffset: number,
): void {
  if ((flags & 1) !== 0) {
    throw new Error("Encrypted blob report archives are not supported")
  }
  if (compressionMethod !== 0 && compressionMethod !== 8) {
    throw new Error(`Unsupported ZIP compression method: ${compressionMethod}`)
  }
  if (
    compressedSize === ZIP64_SENTINEL_32
    || expandedSize === ZIP64_SENTINEL_32
    || localHeaderOffset === ZIP64_SENTINEL_32
  ) {
    throw new Error("ZIP64 blob report entries are not supported")
  }
}

function claimEntry(
  directory: Buffer,
  offset: number,
  name: string,
  localHeaderOffset: number,
  names: Set<string>,
  localOffsets: Set<number>,
): void {
  validateEntryName(name)
  if (names.has(name) || localOffsets.has(localHeaderOffset)) {
    throw new Error(`Duplicate entry in blob report archive: ${name}`)
  }
  if (isSymbolicLink(directory, offset)) {
    throw new Error(`Symbolic links are not allowed in blob report archives: ${name}`)
  }
  names.add(name)
  localOffsets.add(localHeaderOffset)
}

function readCentralEntry(
  directory: Buffer,
  offset: number,
  names: Set<string>,
  localOffsets: Set<number>,
): CentralEntry {
  if (
    offset + 46 > directory.length
    || directory.readUInt32LE(offset) !== CENTRAL_DIRECTORY_SIGNATURE
  ) {
    throw new Error("Blob report archive contains an invalid central directory")
  }
  const flags = directory.readUInt16LE(offset + 8)
  const compressionMethod = directory.readUInt16LE(offset + 10)
  const compressedSize = directory.readUInt32LE(offset + 20)
  const expandedSize = directory.readUInt32LE(offset + 24)
  const nameLength = directory.readUInt16LE(offset + 28)
  const extraLength = directory.readUInt16LE(offset + 30)
  const commentLength = directory.readUInt16LE(offset + 32)
  const localHeaderOffset = directory.readUInt32LE(offset + 42)
  const entryLength = 46 + nameLength + extraLength + commentLength
  if (offset + entryLength > directory.length) {
    throw new Error("Blob report archive contains a truncated directory entry")
  }
  assertSupportedEntry(
    flags,
    compressionMethod,
    compressedSize,
    expandedSize,
    localHeaderOffset,
  )
  const name = directory.subarray(offset + 46, offset + 46 + nameLength).toString("utf8")
  claimEntry(directory, offset, name, localHeaderOffset, names, localOffsets)
  return {
    compressedSize,
    compressionMethod,
    entryLength,
    expandedSize,
    localHeaderOffset,
    name,
  }
}

async function validateLocalHeader(
  file: FileHandle,
  localHeaderOffset: number,
  centralDirectoryOffset: number,
  expectedName: string,
  expectedMethod: number,
  compressedSize: number,
): Promise<void> {
  if (localHeaderOffset < 0 || localHeaderOffset + 30 > centralDirectoryOffset) {
    throw new Error("Blob report archive contains an invalid local file offset")
  }
  const header = await readExactly(file, localHeaderOffset, 30)
  if (header.readUInt32LE(0) !== LOCAL_FILE_SIGNATURE) {
    throw new Error("Blob report archive contains an invalid local file header")
  }
  const flags = header.readUInt16LE(6)
  const compressionMethod = header.readUInt16LE(8)
  const nameLength = header.readUInt16LE(26)
  const extraLength = header.readUInt16LE(28)
  const dataOffset = localHeaderOffset + 30 + nameLength + extraLength
  if ((flags & 1) !== 0 || compressionMethod !== expectedMethod) {
    throw new Error("Blob report archive local and central headers disagree")
  }
  if (dataOffset + compressedSize > centralDirectoryOffset) {
    throw new Error("Blob report archive entry data overlaps its central directory")
  }
  const localName = (await readExactly(file, localHeaderOffset + 30, nameLength)).toString("utf8")
  validateEntryName(localName)
  if (localName !== expectedName) {
    throw new Error("Blob report archive local and central paths disagree")
  }
}

async function inspectCentralDirectory(
  file: FileHandle,
  end: EndOfDirectory,
): Promise<ZipArchiveSummary> {
  const directory = await readExactly(
    file,
    end.centralDirectoryOffset,
    end.centralDirectorySize,
  )
  let compressedBytes = 0
  let expandedBytes = 0
  let offset = 0
  const names = new Set<string>()
  const localOffsets = new Set<number>()
  for (let entry = 0; entry < end.entries; entry += 1) {
    const current = readCentralEntry(directory, offset, names, localOffsets)
    compressedBytes += current.compressedSize
    expandedBytes += current.expandedSize
    if (expandedBytes > MAX_EXPANDED_BYTES) {
      throw new Error("Blob report archive expands beyond the 512 MiB safety limit")
    }
    await validateLocalHeader(
      file,
      current.localHeaderOffset,
      end.centralDirectoryOffset,
      current.name,
      current.compressionMethod,
      current.compressedSize,
    )
    offset += current.entryLength
  }
  if (offset !== directory.length) {
    throw new Error("Blob report archive contains unexpected central directory data")
  }
  return { compressedBytes, entries: end.entries, expandedBytes }
}

export async function inspectZipArchive(path: string): Promise<ZipArchiveSummary> {
  const information = await lstat(path)
  if (information.isSymbolicLink() || !information.isFile()) {
    throw new Error("Blob report archive must be a regular file")
  }
  if (information.size < 22 || information.size > MAX_ARCHIVE_BYTES) {
    throw new Error("Blob report archive must be between 22 bytes and 128 MiB")
  }
  const file = await open(path, "r")
  try {
    const tailLength = Math.min(information.size, 22 + MAX_ZIP_COMMENT_BYTES)
    const tailOffset = information.size - tailLength
    const tail = await readExactly(file, tailOffset, tailLength)
    const end = findEndOfDirectory(tail, tailOffset)
    if (
      end.entries > MAX_ENTRIES
      || end.centralDirectorySize > MAX_CENTRAL_DIRECTORY_BYTES
      || end.centralDirectoryOffset + end.centralDirectorySize > end.offset
    ) {
      throw new Error("Blob report archive directory exceeds its safety limits")
    }
    return await inspectCentralDirectory(file, end)
  } finally {
    await file.close()
  }
}
