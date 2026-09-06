import { mkdir } from "node:fs/promises"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

import sharp from "sharp"

/**
 * Generates the browser icons from the light-mode mark.
 *
 * The source artwork is a wide 1188x856 raster. A favicon must be square, so
 * the mark is contained inside a transparent square canvas rather than cropped,
 * which would cut the waveform that runs past the hexagon.
 */
const root = join(dirname(fileURLToPath(import.meta.url)), "..")
const source = join(root, "public", "logo.png")

const TARGETS = [
  { name: "icon.png", size: 512, background: { r: 0, g: 0, b: 0, alpha: 0 } },
  // Apple touch icons are composited on an opaque tile, so they get the ink
  // background from the palette instead of transparency.
  { name: "apple-icon.png", size: 180, background: { r: 6, g: 12, b: 18, alpha: 1 } },
]

await mkdir(join(root, "src", "app"), { recursive: true })

for (const target of TARGETS) {
  const padding = Math.round(target.size * 0.12)
  const output = join(root, "src", "app", target.name)

  await sharp(source)
    .resize({
      background: { r: 0, g: 0, b: 0, alpha: 0 },
      fit: "contain",
      height: target.size - padding * 2,
      width: target.size - padding * 2,
    })
    .extend({
      background: target.background,
      bottom: padding,
      left: padding,
      right: padding,
      top: padding,
    })
    .flatten(target.background.alpha === 1 ? { background: target.background } : false)
    .png({ compressionLevel: 9, palette: true })
    .toFile(output)

  process.stdout.write(`${target.name} ${String(target.size)}x${String(target.size)}\n`)
}
