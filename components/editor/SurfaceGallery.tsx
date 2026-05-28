"use client";

import { useEffect, useRef, useState } from "react";
import type { Analysis6, Knot } from "@/lib/schema";
import type { PlankDimensions, SurfaceId } from "@/lib/plank";
import { getSurfaceSize } from "@/lib/plank";
import { bboxToPixels, bboxCenter } from "@/lib/bbox";

interface SurfaceGalleryProps {
  dimensions: PlankDimensions;
  surfaceImages: Record<SurfaceId, string>;
  // Optional: when present, overlay detected knots + pair lines
  analysis?: Analysis6 | null;
  selectedKnot?: { surface: SurfaceId; id: number } | null;
  onSelectKnot?: (sel: { surface: SurfaceId; id: number } | null) => void;
}

// Each row is scaled by `widthFraction` of the gallery width — broad faces get
// 100%, edges shrink to match how much smaller they are than the broad face on
// the actual plank. Capped to a sensible min so very thin edges stay legible.
const PAIR_ROWS: {
  a: SurfaceId;
  b: SurfaceId;
  pairAxis: string;
  // Returns a 0–1 width fraction for this row based on plank dimensions.
  widthFraction: (d: PlankDimensions) => number;
}[] = [
  {
    a: "front", b: "back", pairAxis: "thickness",
    widthFraction: () => 1.0,
  },
  {
    a: "top", b: "bottom", pairAxis: "width",
    // Top/bottom share the long axis with front/back, so they're the same width
    widthFraction: () => 1.0,
  },
  {
    a: "left", b: "right", pairAxis: "length",
    // Left/right are sized by the plank's width (short axis), shown smaller
    // and centered. Floor at 35% so they stay readable.
    widthFraction: (d) => Math.max(0.35, Math.min(0.7, d.width_mm / d.length_mm * 2.5)),
  },
];

const KNOT_COLORS: Record<Knot["type"], string> = {
  live: "#10b981",
  dead: "#f97316",
};

const SURFACE_DESCRIPTIONS: Record<SurfaceId, string> = {
  front: "Broad face — primary",
  back: "Broad face — opposite",
  top: "Long edge — top",
  bottom: "Long edge — bottom",
  left: "End — left",
  right: "End — right",
};

export function SurfaceGallery({
  dimensions,
  surfaceImages,
  analysis = null,
  selectedKnot = null,
  onSelectKnot,
}: SurfaceGalleryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<Record<SurfaceId, HTMLDivElement | null>>({
    front: null, back: null, top: null, bottom: null, left: null, right: null,
  });
  const [, forceTick] = useState(0);

  useEffect(() => {
    const ro = new ResizeObserver(() => forceTick((t) => t + 1));
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", () => forceTick((t) => t + 1));
    return () => ro.disconnect();
  }, []);

  // Compute pair lines in container coordinates if we have an analysis
  let pairLines: {
    x1: number; y1: number; x2: number; y2: number; selected: boolean;
  }[] = [];
  if (analysis) {
    const container = containerRef.current;
    if (container) {
      const cr = container.getBoundingClientRect();
      pairLines = analysis.pairs.flatMap((p) => {
        const elA = tileRefs.current[p.a.surface];
        const elB = tileRefs.current[p.b.surface];
        if (!elA || !elB) return [];
        const rA = elA.getBoundingClientRect();
        const rB = elB.getBoundingClientRect();
        const kA = analysis.surfaces[p.a.surface].find((k) => k.id === p.a.id);
        const kB = analysis.surfaces[p.b.surface].find((k) => k.id === p.b.id);
        if (!kA || !kB) return [];
        const cA = bboxCenter(kA.bbox, rA.width, rA.height);
        const cB = bboxCenter(kB.bbox, rB.width, rB.height);
        const sel =
          (selectedKnot?.surface === p.a.surface && selectedKnot.id === p.a.id) ||
          (selectedKnot?.surface === p.b.surface && selectedKnot.id === p.b.id);
        return [{
          x1: rA.left - cr.left + cA.x,
          y1: rA.top - cr.top + cA.y,
          x2: rB.left - cr.left + cB.x,
          y2: rB.top - cr.top + cB.y,
          selected: sel,
        }];
      });
    }
  }

  return (
    <div ref={containerRef} className="relative w-full flex flex-col gap-6">
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
        style={{ overflow: "visible" }}
      >
        {pairLines.map((l, i) => {
          const mx = (l.x1 + l.x2) / 2;
          const my = (l.y1 + l.y2) / 2;
          const dx = l.x2 - l.x1;
          const dy = l.y2 - l.y1;
          const dist = Math.hypot(dx, dy) || 1;
          const offset = Math.min(dist / 5, 40);
          const cx = mx - (dy / dist) * offset;
          const cy = my + (dx / dist) * offset;
          return (
            <path
              key={i}
              d={`M ${l.x1} ${l.y1} Q ${cx} ${cy} ${l.x2} ${l.y2}`}
              stroke={l.selected ? "#f59e0b" : "#d97706"}
              strokeWidth={l.selected ? 2.5 : 1.5}
              fill="none"
              strokeDasharray="6 4"
              opacity={l.selected ? 1 : 0.55}
              strokeLinecap="round"
            />
          );
        })}
      </svg>

      {PAIR_ROWS.map((row) => {
        const widthPct = Math.round(row.widthFraction(dimensions) * 100);
        return (
          <div
            key={`${row.a}-${row.b}`}
            className="flex flex-col gap-2 mx-auto w-full"
            style={{ maxWidth: `${widthPct}%` }}
          >
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider text-neutral-500">
                Through-knot axis: <span className="text-amber-400">{row.pairAxis}</span>
              </span>
              <span className="text-[10px] text-neutral-700">
                ({row.a} ↔ {row.b} — opposite faces)
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <SurfaceTile
                surface={row.a}
                dimensions={dimensions}
                image={surfaceImages[row.a]}
                knots={analysis?.surfaces[row.a]}
                selectedKnot={selectedKnot ?? null}
                onSelectKnot={onSelectKnot}
                tileRef={(el) => { tileRefs.current[row.a] = el; }}
              />
              <SurfaceTile
                surface={row.b}
                dimensions={dimensions}
                image={surfaceImages[row.b]}
                knots={analysis?.surfaces[row.b]}
                selectedKnot={selectedKnot ?? null}
                onSelectKnot={onSelectKnot}
                tileRef={(el) => { tileRefs.current[row.b] = el; }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── One surface tile (image + knot bbox overlay + click hit-testing) ─────────

interface SurfaceTileProps {
  surface: SurfaceId;
  dimensions: PlankDimensions;
  image: string;
  knots?: Knot[];
  selectedKnot: { surface: SurfaceId; id: number } | null;
  onSelectKnot?: (sel: { surface: SurfaceId; id: number } | null) => void;
  tileRef: (el: HTMLDivElement | null) => void;
}

function SurfaceTile({
  surface,
  dimensions,
  image,
  knots,
  selectedKnot,
  onSelectKnot,
  tileRef,
}: SurfaceTileProps) {
  const size = getSurfaceSize(surface, dimensions);
  const ar = size.width_mm / size.height_mm;
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const cv = overlayRef.current;
    const wrap = containerRef.current;
    if (!cv || !wrap) return;
    const draw = () => {
      const r = wrap.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      const dpr = window.devicePixelRatio || 1;
      cv.width = r.width * dpr;
      cv.height = r.height * dpr;
      cv.style.width = `${r.width}px`;
      cv.style.height = `${r.height}px`;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, r.width, r.height);
      if (!knots) return;
      for (const k of knots) {
        const isSel = selectedKnot?.surface === surface && selectedKnot.id === k.id;
        const color = KNOT_COLORS[k.type];
        const rect = bboxToPixels(k.bbox, r.width, r.height);
        ctx.strokeStyle = color;
        ctx.lineWidth = isSel ? 3 : 1.6;
        ctx.globalAlpha = isSel ? 1 : 0.85;
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        ctx.font = `bold ${Math.max(10, Math.min(13, rect.width / 3))}px Inter, sans-serif`;
        ctx.fillStyle = color;
        ctx.globalAlpha = 1;
        const labelY = rect.y > 14 ? rect.y - 3 : rect.y + 12;
        ctx.fillText(`#${k.id}`, rect.x + 2, labelY);
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [knots, selectedKnot, surface]);

  const setRefs = (el: HTMLDivElement | null) => {
    containerRef.current = el;
    tileRef(el);
  };

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!knots || !onSelectKnot) return;
    const wrap = containerRef.current;
    if (!wrap) return;
    const r = wrap.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    const hit = knots.find((k) => {
      const b = bboxToPixels(k.bbox, r.width, r.height);
      return mx >= b.x && mx <= b.x + b.width && my >= b.y && my <= b.y + b.height;
    });
    onSelectKnot(hit ? { surface, id: hit.id } : null);
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between px-0.5">
        <span className="text-sm font-semibold uppercase tracking-wider text-neutral-200">
          {surface}
        </span>
        <span className="text-[11px] text-neutral-500 font-mono">
          {size.width_mm} × {size.height_mm} mm
        </span>
      </div>
      <p className="text-[11px] text-neutral-600 px-0.5">{SURFACE_DESCRIPTIONS[surface]}</p>
      <div
        ref={setRefs}
        onClick={handleClick}
        className="relative overflow-hidden border border-neutral-800 bg-neutral-900 cursor-pointer"
        style={{ aspectRatio: `${ar}` }}
      >
        {image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={`data:image/jpeg;base64,${image}`}
            alt={`${surface} surface`}
            className="w-full h-full block"
          />
        ) : (
          <div className="w-full h-full bg-neutral-900 flex items-center justify-center text-xs text-neutral-700">
            Rendering…
          </div>
        )}
        <canvas ref={overlayRef} className="absolute inset-0 pointer-events-none" />
      </div>
    </div>
  );
}
