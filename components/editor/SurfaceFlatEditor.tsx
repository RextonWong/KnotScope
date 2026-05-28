"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  EditableKnot,
  PlankDimensions,
  SurfaceId,
} from "@/lib/plank";
import { getSurfaceSize, makeDefaultKnot } from "@/lib/plank";
import { renderSurface } from "@/lib/renderSurface";

interface SurfaceFlatEditorProps {
  surface: SurfaceId;
  dimensions: PlankDimensions;
  knots: EditableKnot[];
  selectedKnotId: string | null;
  onAddKnot: (knot: EditableKnot) => void;
  onUpdateKnot: (id: string, patch: Partial<EditableKnot>) => void;
  onSelectKnot: (id: string | null) => void;
}

type DragKind = "move" | "resize" | "rotate" | null;

interface DragState {
  kind: DragKind;
  startU: number;
  startV: number;
  startDiameter: number;
  startRotation: number;
  startMouseX: number;
  startMouseY: number;
  containerRect: DOMRect;
}

export function SurfaceFlatEditor({
  surface,
  dimensions,
  knots,
  selectedKnotId,
  onAddKnot,
  onUpdateKnot,
  onSelectKnot,
}: SurfaceFlatEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [, forceTick] = useState(0); // re-trigger overlay positioning on resize

  const surfaceSize = useMemo(
    () => getSurfaceSize(surface, dimensions),
    [surface, dimensions]
  );
  const ar = surfaceSize.width_mm / surfaceSize.height_mm;

  const mineKnots = knots.filter((k) => k.surface === surface);

  // Re-render the wood texture when surface, dimensions, or knots change.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const r = await renderSurface(surface, dimensions, knots);
      if (cancelled || !canvasRef.current) return;
      const img = new Image();
      img.onload = () => {
        const cv = canvasRef.current;
        if (!cv) return;
        cv.width = r.widthPx;
        cv.height = r.heightPx;
        const ctx = cv.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
      };
      img.src = `data:image/jpeg;base64,${r.base64}`;
    })();
    return () => {
      cancelled = true;
    };
  }, [surface, dimensions, knots]);

  // Track container resize so the absolute-positioned overlays follow
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => forceTick((t) => t + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Click on empty canvas → add knot
  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return; // clicked a child overlay
    const rect = e.currentTarget.getBoundingClientRect();
    const u = (e.clientX - rect.left) / rect.width;
    const v = (e.clientY - rect.top) / rect.height;
    if (u < 0 || u > 1 || v < 0 || v > 1) return;
    onAddKnot(makeDefaultKnot(surface, u, v));
  };

  // Drag handlers — pointer events on the whole document while dragging
  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const knot = knots.find((k) => k.id === selectedKnotId);
      if (!knot) return;
      const r = d.containerRect;
      const dx = e.clientX - d.startMouseX;
      const dy = e.clientY - d.startMouseY;

      if (d.kind === "move") {
        const newU = Math.max(0, Math.min(1, d.startU + dx / r.width));
        const newV = Math.max(0, Math.min(1, d.startV + dy / r.height));
        onUpdateKnot(knot.id, { u: newU, v: newV });
      } else if (d.kind === "resize") {
        // Resize based on diagonal distance from center
        const cx = d.startU * r.width;
        const cy = d.startV * r.height;
        const px = e.clientX - r.left;
        const py = e.clientY - r.top;
        const px0 = d.startMouseX - r.left;
        const py0 = d.startMouseY - r.top;
        const dist0 = Math.hypot(px0 - cx, py0 - cy);
        const dist1 = Math.hypot(px - cx, py - cy);
        if (dist0 < 1) return;
        const ratio = dist1 / dist0;
        const next = Math.max(3, Math.min(120, d.startDiameter * ratio));
        onUpdateKnot(knot.id, { diameter_mm: Math.round(next) });
      } else if (d.kind === "rotate") {
        const cx = d.startU * r.width;
        const cy = d.startV * r.height;
        const px = e.clientX - r.left;
        const py = e.clientY - r.top;
        const angle = (Math.atan2(py - cy, px - cx) * 180) / Math.PI;
        // Rotate handle is always to the right initially, so subtract starting angle
        onUpdateKnot(knot.id, { rotation_deg: (Math.round(angle) + 360) % 360 });
      }
    };
    const onUp = () => {
      dragRef.current = null;
      document.body.style.userSelect = "";
    };
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
    };
  }, [knots, selectedKnotId, onUpdateKnot]);

  const startDrag = (knot: EditableKnot, kind: DragKind, e: React.PointerEvent) => {
    e.stopPropagation();
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    dragRef.current = {
      kind,
      startU: knot.u,
      startV: knot.v,
      startDiameter: knot.diameter_mm,
      startRotation: knot.rotation_deg,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      containerRect: rect,
    };
    onSelectKnot(knot.id);
    document.body.style.userSelect = "none";
  };

  // Cap visual height so very long faces don't dominate, then derive max-width
  // from aspect ratio. The wrapper centers the canvas horizontally.
  return (
    <div
      ref={containerRef}
      onClick={handleCanvasClick}
      className="relative bg-neutral-900 overflow-hidden border border-neutral-800 mx-auto"
      style={{ aspectRatio: `${ar}`, width: "100%", maxHeight: "70vh", maxWidth: `min(100%, calc(70vh * ${ar}))` }}
    >
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />

      {/* Knot overlays */}
      {mineKnots.map((k) => {
        const baseAr = Math.max(0.3, Math.min(3, k.aspect_ratio || 1));
        const wMm = k.diameter_mm * (baseAr >= 1 ? baseAr : 1);
        const hMm = k.diameter_mm * (baseAr >= 1 ? 1 : 1 / baseAr);
        const wPct = (wMm / surfaceSize.width_mm) * 100;
        const hPct = (hMm / surfaceSize.height_mm) * 100;
        const leftPct = k.u * 100;
        const topPct = k.v * 100;
        const isSelected = k.id === selectedKnotId;

        return (
          <div
            key={k.id}
            className="absolute"
            style={{
              left: `${leftPct}%`,
              top: `${topPct}%`,
              width: `${wPct}%`,
              height: `${hPct}%`,
              transform: `translate(-50%, -50%) rotate(${k.rotation_deg}deg)`,
              pointerEvents: "none",
            }}
          >
            {/* Hit area */}
            <div
              role="button"
              tabIndex={0}
              onPointerDown={(e) => startDrag(k, "move", e)}
              onClick={(e) => { e.stopPropagation(); onSelectKnot(k.id); }}
              className={`absolute inset-0 rounded-full cursor-move ${
                isSelected
                  ? "border-2 border-amber-500 bg-amber-500/5"
                  : "border-2 border-transparent hover:border-amber-500/50"
              }`}
              style={{ pointerEvents: "auto" }}
            />
            {isSelected && (
              <>
                {/* Resize handle (right-bottom) */}
                <div
                  onPointerDown={(e) => startDrag(k, "resize", e)}
                  className="absolute -right-1.5 -bottom-1.5 w-3 h-3 rounded-full bg-amber-500 border border-neutral-950 cursor-nwse-resize"
                  style={{ pointerEvents: "auto" }}
                  title="Drag to resize"
                />
                {/* Rotate handle (top, offset) */}
                <div
                  onPointerDown={(e) => startDrag(k, "rotate", e)}
                  className="absolute left-1/2 -translate-x-1/2 -top-5 w-3 h-3 rounded-full bg-amber-500 border border-neutral-950 cursor-grab"
                  style={{ pointerEvents: "auto" }}
                  title="Drag to rotate"
                />
              </>
            )}
          </div>
        );
      })}

      {/* Surface label */}
      <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-neutral-950/80 text-xs font-semibold uppercase tracking-wider text-neutral-300 pointer-events-none">
        {surface}
      </div>
      <div className="absolute top-2 right-2 px-2 py-1 rounded-md bg-neutral-950/70 text-xs font-mono text-neutral-500 pointer-events-none">
        {surfaceSize.width_mm} × {surfaceSize.height_mm} mm
      </div>

      {mineKnots.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xs text-neutral-500 bg-neutral-950/70 px-3 py-1.5 rounded-full">
            Click anywhere to add a knot
          </span>
        </div>
      )}
    </div>
  );
}
