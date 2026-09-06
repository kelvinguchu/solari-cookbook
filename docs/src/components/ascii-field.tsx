"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * A braille ramp ordered strictly by ink density, from one raised dot to eight.
 * A monotonic ramp is what makes the field read as a *signal* rather than as
 * decorative noise: brightness maps to wave amplitude with no visual jitter.
 */
const RAMP = " ⠁⠃⠇⠏⠟⠿⣿";

const CELL_SIZE = 13;
const WAVE_COUNT = 4;
const RIPPLE_LIFETIME = 3600;

interface Wave {
  amplitude: number;
  frequency: number;
  phase: number;
  speed: number;
  x: number;
  y: number;
}

interface Ripple {
  bornAt: number;
  x: number;
  y: number;
}

interface Field {
  columns: number;
  height: number;
  rows: number;
  width: number;
}

interface AsciiFieldProps {
  className?: string;
  /** Multiplier on the wave clock. 0 renders one static frame. */
  speed?: number;
}

function seedWaves(columns: number, rows: number): Wave[] {
  return Array.from({ length: WAVE_COUNT }, (_, index) => {
    const spread = (index + 1) / (WAVE_COUNT + 1);
    return {
      amplitude: 0.75 + spread * 0.45,
      frequency: 0.16 + spread * 0.2,
      phase: spread * Math.PI * 2,
      speed: 0.45 + spread * 0.5,
      x: columns * (0.2 + spread * 0.6),
      y: rows * (0.7 - spread * 0.4),
    };
  });
}

function rippleAmplitude(
  ripples: Ripple[],
  x: number,
  y: number,
  now: number,
): number {
  let total = 0;
  for (const ripple of ripples) {
    const age = now - ripple.bornAt;
    if (age > RIPPLE_LIFETIME) {
      continue;
    }
    const progress = age / RIPPLE_LIFETIME;
    const distance = Math.hypot(x - ripple.x, y - ripple.y);
    const front = progress * 46;
    const offset = Math.abs(distance - front);
    if (offset > 7) {
      continue;
    }
    total += (1 - progress) * (1 - offset / 7) * Math.cos(offset * 0.6) * 1.5;
  }
  return total;
}

/**
 * An interference field rendered as braille glyphs on a canvas. It is the
 * landing page's one moving element: several standing waves plus a pointer
 * source, so the surface stays noisy until it settles - the same "noise
 * resolving into a repeatable signal" idea the product is built on.
 *
 * The field pauses whenever it scrolls out of view or the tab is hidden, and
 * renders a single static frame when the visitor prefers reduced motion.
 */
export function AsciiField({ className, speed = 0.7 }: AsciiFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const fieldRef = useRef<Field>({ columns: 0, height: 0, rows: 0, width: 0 });
  const wavesRef = useRef<Wave[]>([]);
  const ripplesRef = useRef<Ripple[]>([]);
  const pointerRef = useRef({ x: -999, y: -999 });
  const clockRef = useRef(0);
  const visibleRef = useRef(true);

  const measure = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const columns = Math.max(1, Math.ceil(rect.width / CELL_SIZE));
    const rows = Math.max(1, Math.ceil(rect.height / CELL_SIZE));

    fieldRef.current = {
      columns,
      height: rect.height,
      rows,
      width: rect.width,
    };
    canvas.width = Math.round(rect.width * ratio);
    canvas.height = Math.round(rect.height * ratio);

    const context = canvas.getContext("2d");
    if (context) {
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }
    if (wavesRef.current.length === 0) {
      wavesRef.current = seedWaves(columns, rows);
    }
  }, []);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    const { columns, height, rows, width } = fieldRef.current;
    if (!canvas || !context || width === 0 || height === 0) {
      return;
    }

    const styles = getComputedStyle(canvas);
    const tint =
      styles.getPropertyValue("--fl-ascii").trim() || "128, 128, 128";
    const now = Date.now();
    const clock = clockRef.current;
    const pointer = pointerRef.current;
    const waves = wavesRef.current;
    const ripples = ripplesRef.current;

    context.clearRect(0, 0, width, height);
    context.font = `${String(CELL_SIZE - 2)}px ${styles.fontFamily}`;
    context.textAlign = "center";
    context.textBaseline = "middle";

    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        let total = 0;

        for (const wave of waves) {
          const distance = Math.hypot(column - wave.x, row - wave.y);
          const falloff = 1 / (1 + distance * 0.028);
          total +=
            Math.sin(
              distance * wave.frequency - clock * wave.speed + wave.phase,
            ) *
            wave.amplitude *
            falloff;
        }

        const pointerDistance = Math.hypot(column - pointer.x, row - pointer.y);
        if (pointerDistance < 26) {
          const falloff = 1 - pointerDistance / 26;
          total +=
            Math.sin(pointerDistance * 0.4 - clock * 1.8) * falloff * 1.35;
        }

        total += rippleAmplitude(ripples, column, row, now);

        // A narrow band clips the extremes. That is what turns a flat texture
        // into banded crests with empty troughs between them.
        const normalized = (total + 1.25) / 2.5;
        if (normalized <= 0.3) {
          continue;
        }

        const level = Math.min(
          RAMP.length - 1,
          Math.max(0, Math.round(Math.min(normalized, 1) * (RAMP.length - 1))),
        );
        const glyph = RAMP[level];
        if (glyph === " ") {
          continue;
        }

        context.fillStyle = `rgba(${tint}, ${Math.min(0.8, 0.06 + normalized * 0.78).toFixed(3)})`;
        context.fillText(
          glyph,
          column * CELL_SIZE + CELL_SIZE / 2,
          row * CELL_SIZE + CELL_SIZE / 2,
        );
      }
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    measure();

    if (reduced.matches) {
      clockRef.current = 6;
      paint();
      return;
    }

    let previous = performance.now();
    const step = (timestamp: number) => {
      const delta = Math.min(timestamp - previous, 64);
      previous = timestamp;
      if (visibleRef.current && !document.hidden) {
        clockRef.current += (delta / 1000) * speed * 2.4;
        ripplesRef.current = ripplesRef.current.filter(
          (ripple) => Date.now() - ripple.bornAt < RIPPLE_LIFETIME,
        );
        paint();
      }
      frameRef.current = requestAnimationFrame(step);
    };
    frameRef.current = requestAnimationFrame(step);

    const resizeObserver = new ResizeObserver(() => {
      measure();
    });
    resizeObserver.observe(canvas);

    const intersectionObserver = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        visibleRef.current = entry.isIntersecting;
      }
    });
    intersectionObserver.observe(canvas);

    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
    };
  }, [measure, paint, speed]);

  const toCell = (event: { clientX: number; clientY: number }) => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return null;
    }
    const rect = canvas.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) / CELL_SIZE,
      y: (event.clientY - rect.top) / CELL_SIZE,
    };
  };

  return (
    <canvas
      className={className}
      onPointerDown={(event) => {
        const cell = toCell(event);
        if (cell) {
          ripplesRef.current = [
            ...ripplesRef.current.slice(-5),
            { bornAt: Date.now(), ...cell },
          ];
        }
      }}
      onPointerLeave={() => {
        pointerRef.current = { x: -999, y: -999 };
      }}
      onPointerMove={(event) => {
        const cell = toCell(event);
        if (cell) {
          pointerRef.current = cell;
        }
      }}
      ref={canvasRef}
      role="presentation"
    />
  );
}
