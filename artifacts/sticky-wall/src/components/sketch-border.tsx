import { useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * Hand-drawn pencil border rendered as an SVG rounded-rect path with a
 * subtle roughen filter. On mount it animates a stroke-dashoffset reveal
 * (~400ms ease-out) so the border feels like it's being sketched in.
 *
 * Respects `prefers-reduced-motion`: when the user prefers reduced motion
 * the dash-reveal is skipped and the border renders statically with the
 * same rough/pencil look.
 */
export type SketchBorderProps = {
  /** Stroke color, e.g. "#0E0F0C" or a CSS variable. */
  color?: string;
  /** Stroke width in px. */
  strokeWidth?: number;
  /** Corner radius in px. */
  radius?: number;
  /** Inset from the container edge so the rough stroke isn't clipped. */
  inset?: number;
  /** When true, render dashed (used for the retire zone). */
  dashed?: boolean;
  /** Force the draw-in animation to (re)play when this key changes. */
  animationKey?: string | number;
  /** Disable the draw-in reveal entirely. */
  staticOnly?: boolean;
  /** Reveal duration in ms. */
  durationMs?: number;
  className?: string;
};

const FILTER_ID = "sticky-pencil-roughen";

function usePrefersReducedMotion() {
  const [prefers, setPrefers] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setPrefers(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setPrefers(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return prefers;
}

/**
 * Renders the shared <defs> with the pencil-roughen filter. Mount once at
 * the app root so every SketchBorder can reference it via filter url(#...).
 */
export function SketchDefs() {
  return (
    <svg
      width="0"
      height="0"
      aria-hidden="true"
      style={{ position: "absolute", pointerEvents: "none" }}
    >
      <defs>
        <filter
          id={FILTER_ID}
          x="-5%"
          y="-5%"
          width="110%"
          height="110%"
          filterUnits="objectBoundingBox"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.9"
            numOctaves="2"
            seed="3"
            result="noise"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="noise"
            scale="1.6"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}

export function SketchBorder({
  color = "currentColor",
  strokeWidth = 1.5,
  radius = 6,
  inset = 3,
  dashed = false,
  animationKey,
  staticOnly = false,
  durationMs = 420,
  className,
}: SketchBorderProps) {
  const prefersReducedMotion = usePrefersReducedMotion();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rectRef = useRef<SVGRectElement | null>(null);
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") {
      if (el) {
        const r = el.getBoundingClientRect();
        setSize({ w: r.width, h: r.height });
      }
      return;
    }
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize((prev) =>
        prev && prev.w === width && prev.h === height
          ? prev
          : { w: width, h: height },
      );
    });
    ro.observe(el);
    const initial = el.getBoundingClientRect();
    setSize({ w: initial.width, h: initial.height });
    return () => ro.disconnect();
  }, []);

  const animate = !staticOnly && !prefersReducedMotion;
  const restingDash = dashed ? "10 8" : undefined;

  // Approximate perimeter of the rounded rect — used as the dash length
  // for the reveal animation. Slightly overshoot so the stroke fully
  // settles by the end of the transition.
  const perimeter = size
    ? 2 * (size.w + size.h - 2 * inset * 2 - radius * (4 - Math.PI))
    : 0;

  // Drive the reveal: start with offset = perimeter, then on the next
  // frame transition to 0. Re-runs whenever animationKey or size changes.
  useEffect(() => {
    const el = rectRef.current;
    if (!el || !size) return;
    if (!animate) {
      el.style.transition = "none";
      el.setAttribute("stroke-dashoffset", "0");
      el.setAttribute("stroke-dasharray", restingDash ?? "");
      return;
    }
    el.style.transition = "none";
    el.setAttribute("stroke-dasharray", `${perimeter} ${perimeter}`);
    el.setAttribute("stroke-dashoffset", String(perimeter));
    // Force layout
    void el.getBoundingClientRect();
    const raf1 = window.requestAnimationFrame(() => {
      const raf2 = window.requestAnimationFrame(() => {
        el.style.transition = `stroke-dashoffset ${durationMs}ms cubic-bezier(0.22, 1, 0.36, 1)`;
        el.setAttribute("stroke-dashoffset", "0");
      });
      // Track second RAF so we can cancel
      cleanup.raf2 = raf2;
    });
    const cleanup = { raf1, raf2: 0 };

    let dashTimeout: number | undefined;
    if (restingDash) {
      dashTimeout = window.setTimeout(() => {
        el.style.transition = "none";
        el.setAttribute("stroke-dasharray", restingDash);
        el.setAttribute("stroke-dashoffset", "0");
      }, durationMs + 40);
    }

    return () => {
      window.cancelAnimationFrame(cleanup.raf1);
      if (cleanup.raf2) window.cancelAnimationFrame(cleanup.raf2);
      if (dashTimeout !== undefined) window.clearTimeout(dashTimeout);
    };
  }, [animate, size, perimeter, durationMs, restingDash, animationKey]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: "absolute",
        inset: 0,
        pointerEvents: "none",
      }}
      aria-hidden="true"
    >
      {size ? (
        <svg
          width={size.w}
          height={size.h}
          viewBox={`0 0 ${size.w} ${size.h}`}
          style={{ display: "block", overflow: "visible" }}
        >
          <rect
            ref={rectRef}
            x={inset}
            y={inset}
            width={Math.max(0, size.w - inset * 2)}
            height={Math.max(0, size.h - inset * 2)}
            rx={radius}
            ry={radius}
            fill="none"
            stroke={color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={animate ? undefined : restingDash}
            strokeDashoffset={animate ? undefined : 0}
            style={{ filter: `url(#${FILTER_ID})` }}
          />
        </svg>
      ) : null}
    </div>
  );
}
