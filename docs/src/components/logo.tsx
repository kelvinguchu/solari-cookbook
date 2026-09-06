import Image from "next/image"

import darkModeMark from "../../public/logo-light.png"
import lightModeMark from "../../public/logo.png"

interface LogoProps {
  /** Rendered height in pixels. The mark keeps its 1188x856 aspect ratio. */
  size?: number
  withWordmark?: boolean
}

/**
 * The FlakeLab mark. Two files ship because the artwork is raster: `logo.png`
 * is drawn for light backgrounds and `logo-light.png` for dark ones. Both are
 * rendered and the inactive one is hidden, so the swap costs no JavaScript and
 * survives a hydration-free first paint.
 */
export function Logo({ size = 26, withWordmark = true }: LogoProps) {
  const width = Math.round(size * 1.388)

  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className="relative block shrink-0"
        style={{ height: size, width }}
      >
        <Image
          alt=""
          className="block object-contain dark:hidden"
          fill
          priority
          sizes={`${String(width)}px`}
          src={lightModeMark}
        />
        <Image
          alt=""
          className="hidden object-contain dark:block"
          fill
          priority
          sizes={`${String(width)}px`}
          src={darkModeMark}
        />
      </span>
      {withWordmark ? (
        <span className="text-[0.9375rem] font-medium tracking-tight">
          FlakeLab
        </span>
      ) : null}
    </span>
  )
}
