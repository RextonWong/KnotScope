"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Analysis6, Knot } from "@/lib/schema";
import type { PlankDimensions, SurfaceId } from "@/lib/plank";
import { getSurfaceSize } from "@/lib/plank";
import { bboxToPixels, bboxCenter } from "@/lib/bbox";

interface SurfaceUnfoldedProps {
  analysis: Analysis6;
  dimensions: PlankDimensions;
  surfaceImages: Record<SurfaceId, string>; // base64 (already rendered)
  selectedKnot: { surface: SurfaceId; id: number } | null;
  onSelectKnot: (sel: { surface: SurfaceId; id: number } | null) => void;
}

const KNOT_COLORS: Record<Knot["type"], string> = {
  live: "#10b981",
  dead: "#f97316",
  knot_hole: "#ef4444",
};

export function SurfaceUnfolded({
  analysis,
  dimensions,
  surfaceImages,
  selectedKnot,
  onSelectKnot,
}: SurfaceUnfoldedProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tileRefs = useRef<Record<SurfaceId, HTMLDivElement | null>>({
    front: null, back: null, top: null, bottom: null, left: null, right: null,
  });
  const [rects, setRects] = useState<Partial<Record<SurfaceId, DOMRect>>>({});

  const measure = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const cr = container.getBoundingClientRect();
    const next: Partial<Record<SurfaceId, DOMRect>> = {};
    (Object.keys(tileRefs.current) as SurfaceId[]).forEach((s) => {
      const el = tileRefs.current[s];
      if (!el) return;
      const r = el.getBoundingClientRect();
      next[s] = new DOMRect(r.left - cr.left, r.top - cr.top, r.width, r.height);
    });
    setRects(next);
  }, []);

  useEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [measure, surfaceImages]);

  // Build pair lines in container coordinate space
  const pairLines = analysis.pairs.flatMap((p) => {
    const ra = rects[p.a.surface];
    const rb = rects[p.b.surface];
    if (!ra || !rb) return [];
    const ka = analysis.surfaces[p.a.surface].find((k) => k.id === p.a.id);
    const kb = analysis.surfaces[p.b.surface].find((k) => k.id === p.b.id);
    if (!ka || !kb) return [];

    const cA = bboxCenter(ka.bbox, ra.width, ra.height);
    const cB = bboxCenter(kb.bbox, rb.width, rb.height);

    const isSelected =
      (selectedKnot?.surface === p.a.surface && selectedKnot.id === p.a.id) ||
      (selectedKnot?.surface === p.b.surface && selectedKnot.id === p.b.id);

    return [{
      x1: ra.left + cA.x,
      y1: ra.top + cA.y,
      x2: rb.left + cB.x,
      y2: rb.top + cB.y,
      isSelected,
    }];
  });

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
        style={{ overflow: "visible" }}
      >
        {pairLines.map((l, i) => {
          // Quadratic curve with a midpoint offset perpendicular to the segment,
          // for a softer connection line.
          const mx = (l.x1 + l.x2) / 2;
          const my = (l.y1 + l.y2) / 2;
          const dx = l.x2 - l.x1;
          const dy = l.y2 - l.y1;
          const dist = Math.hypot(dx, dy);
          const offset = Math.min(dist / 6, 50);
          const cx = mx - (dy / (dist || 1)) * offset;
          const cy = my + (dx / (dist || 1)) * offset;
          return (
            <path
              key={i}
              d={`M ${l.x1} ${l.y1} Q ${cx} ${cy} ${l.x2} ${l.y2}`}
              stroke={l.isSelected ? "#f59e0b" : "#d97706"}
              strokeWidth={l.isSelected ? 2.5 : 1.5}
              fill="none"
              strokeDasharray="6 4"
              opacity={l.isSelected ? 1 : 0.5}
              strokeLinecap="round"
            />
          );
        })}
      </svg>

      {/* T-net layout via CSS grid: 5 columns × 4 rows */}
      <div className="grid gap-3" style={{
        gridTemplateColumns: "1fr 2fr 1fr 2fr 1fr",
        gridTemplateRows: "auto auto auto auto",
      }}>
        {/* Row 1: TOP */}
        <div /><div /><div /><SurfaceTile
          surface="top"
          dims={dimensions}
          image={surfaceImages.top}
          knots={analysis.surfaces.top}
          selectedKnot={selectedKnot}
          onSelectKnot={onSelectKnot}
          tileRef={(el) => { tileRefs.current.top = el; }}
        /><div />

        {/* Row 2: LEFT FRONT RIGHT */}
        <SurfaceTile
          surface="left"
          dims={dimensions}
          image={surfaceImages.left}
          knots={analysis.surfaces.left}
          selectedKnot={selectedKnot}
          onSelectKnot={onSelectKnot}
          tileRef={(el) => { tileRefs.current.left = el; }}
        />
        <div /> {/* spacer between left and front to give the unfolded look */}
        <SurfaceTile
          surface="front"
          dims={dimensions}
          image={surfaceImages.front}
          knots={analysis.surfaces.front}
          selectedKnot={selectedKnot}
          onSelectKnot={onSelectKnot}
          tileRef={(el) => { tileRefs.current.front = el; }}
          span={3}
        />

        {/* Row 3: BOTTOM */}
        <div /><div /><div /><SurfaceTile
          surface="bottom"
          dims={dimensions}
          image={surfaceImages.bottom}
          knots={analysis.surfaces.bottom}
          selectedKnot={selectedKnot}
          onSelectKnot={onSelectKnot}
          tileRef={(el) => { tileRefs.current.bottom = el; }}
        /><div />

        {/* Row 4: BACK with RIGHT and LEFT bookends so all surfaces appear */}
        <SurfaceTile
          surface="right"
          dims={dimensions}
          image={surfaceImages.right}
          knots={analysis.surfaces.right}
          selectedKnot={selectedKnot}
          onSelectKnot={onSelectKnot}
          tileRef={(el) => { tileRefs.current.right = el; }}
        />
        <div />
        <SurfaceTile
          surface="back"
          dims={dimensions}
          image={surfaceImages.back}
          knots={analysis.surfaces.back}
          selectedKnot={selectedKnot}
          onSelectKnot={onSelectKnot}
          tileRef={(el) => { tileRefs.current.back = el; }}
          span={3}
        />
      </div>
    </div>
  );
}

// ── Single surface tile ──────────────────────────────────────────────────────

interface SurfaceTileProps {
  surface: SurfaceId;
  dims: PlankDimensions;
  image: string | undefined;
  knots: Knot[];
  selectedKnot: { surface: SurfaceId; id: number } | null;
  onSelectKnot: (sel: { surface: SurfaceId; id: number } | null) => void;
  tileRef?: (el: HTMLDivElement | null) => void;
  span?: number;
}

function SurfaceTile({
  surface,
  dims,
  image,
  knots,
  selectedKnot,
  onSelectKnot,
  tileRef,
  span,
}: SurfaceTileProps) {
  const size = getSurfaceSize(surface, dims);
  const ar = size.width_mm / size.height_mm;
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Draw bbox overlays on a transparent canvas sized to the container
  useEffect(() => {
    const cv = overlayRef.current;
    const wrap = containerRef.current;
    if (!cv || !wrap) return;
    const draw = () => {
      const r = wrap.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      cv.width = r.width * (window.devicePixelRatio || 1);
      cv.height = r.height * (window.devicePixelRatio || 1);
      cv.style.width = `${r.width}px`;
      cv.style.height = `${r.height}px`;
      const ctx = cv.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(window.devicePixelRatio || 1, 0, 0, window.devicePixelRatio || 1, 0, 0);
      ctx.clearRect(0, 0, r.width, r.height);
      for (const k of knots) {
        const isSel = selectedKnot?.surface === surface && selectedKnot.id === k.id;
        const color = KNOT_COLORS[k.type];
        const rect = bboxToPixels(k.bbox, r.width, r.height);
        ctx.strokeStyle = color;
        ctx.lineWidth = isSel ? 3 : 1.5;
        ctx.globalAlpha = isSel ? 1 : 0.8;
        ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
        ctx.font = `bold ${Math.max(9, Math.min(12, rect.width / 3))}px Inter, sans-serif`;
        ctx.fillStyle = color;
        ctx.globalAlpha = 1;
        ctx.fillText(`#${k.id}`, rect.x + 2, rect.y - 2);
      }
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [knots, selectedKnot, surface]);

  const setRefs = (el: HTMLDivElement | null) => {
    containerRef.current = el;
    tileRef?.(el);
  };

  return (
    <div
      ref={setRefs}
      style={{ gridColumn: span ? `span ${span}` : undefined, aspectRatio: `${ar}` }}
      className="relative rounded-xl overflow-hidden border border-neutral-800 bg-neutral-900 cursor-pointer"
      onClick={(e) => {
        // Did the click land inside a knot bbox?
        const wrap = containerRef.current;
        if (!wrap) return;
        const r = wrap.getBoundingClientRect();
        const mx = e.clientX - r.left;
        const my = e.clientY - r.top;
        const hit = knots.find((k) => {
          const b = bboxToPixels(k.bbox, r.width, r.height);
          return mx >= b.x && mx <= b.x + b.width && my >= b.y && my <= b.y + b.height;
        });
        if (hit) {
          onSelectKnot({ surface, id: hit.id });
        } else {
          onSelectKnot(null);
        }
      }}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`data:image/jpeg;base64,${image}`} alt={surface} className="w-full h-full block" />
      ) : (
        <div className="w-full h-full bg-neutral-900" />
      )}
      <canvas ref={overlayRef} className="absolute inset-0 pointer-events-none" />
      <div className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-neutral-950/80 text-[10px] font-semibold uppercase tracking-wider text-neutral-300 pointer-events-none">
        {surface}
      </div>
    </div>
  );
}
