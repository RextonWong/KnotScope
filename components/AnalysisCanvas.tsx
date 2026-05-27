"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Knot } from "@/lib/schema";
import { bboxToPixels } from "@/lib/bbox";

const TYPE_COLORS: Record<Knot["type"], string> = {
  live: "#10b981",
  dead: "#f97316",
  knot_hole: "#ef4444",
};

interface AnalysisCanvasProps {
  image: string;
  mimeType?: string;
  knots: Knot[];
  face: "front" | "back";
  hoveredId: number | null;
  selectedId: number | null;
  onKnotHover: (id: number | null) => void;
  onKnotClick: (id: number) => void;
  onImageLoad?: () => void;
}

export function AnalysisCanvas({
  image,
  mimeType = "image/jpeg",
  knots,
  face,
  hoveredId,
  selectedId,
  onKnotHover,
  onKnotClick,
  onImageLoad,
}: AnalysisCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [imgSize, setImgSize] = useState({ w: 0, h: 0 });

  const syncCanvas = useCallback((img: HTMLImageElement) => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const cssW = container.offsetWidth;
    const scale = cssW / img.naturalWidth;
    const cssH = img.naturalHeight * scale;
    const dpr = window.devicePixelRatio || 1;

    // Back-store at physical resolution for sharp retina rendering
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    // But keep CSS display size at logical pixels
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;

    setImgSize({ w: cssW, h: cssH });
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || imgSize.w === 0) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr); // draw in logical (CSS) pixel space

    for (const knot of knots) {
      const rect = bboxToPixels(knot.bbox, imgSize.w, imgSize.h);
      const isActive = knot.id === hoveredId || knot.id === selectedId;
      const color = TYPE_COLORS[knot.type];

      ctx.strokeStyle = color;
      ctx.lineWidth = isActive ? 3 : 1.5;
      ctx.globalAlpha = isActive ? 1 : 0.75;
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);

      if (isActive) {
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.15;
        ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
        ctx.globalAlpha = 1;
      }

      const label = `#${knot.id}`;
      const fontSize = Math.max(10, Math.min(14, rect.width / 2.5));
      ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`;
      ctx.globalAlpha = isActive ? 1 : 0.85;
      ctx.fillStyle = color;
      const textY = rect.y - 3 > 0 ? rect.y - 3 : rect.y + fontSize + 2;
      ctx.fillText(label, rect.x + 2, textY);
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }, [knots, hoveredId, selectedId, imgSize]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Redraw on container resize (e.g. window resize or panel toggle)
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver(() => {
      const img = imgRef.current;
      if (img?.complete) syncCanvas(img);
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, [syncCanvas]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const hit = knots.find((k) => {
        const b = bboxToPixels(k.bbox, imgSize.w, imgSize.h);
        return mx >= b.x && mx <= b.x + b.width && my >= b.y && my <= b.y + b.height;
      });
      onKnotHover(hit?.id ?? null);
    },
    [knots, imgSize, onKnotHover]
  );

  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const r = canvas.getBoundingClientRect();
      const mx = e.clientX - r.left;
      const my = e.clientY - r.top;
      const hit = knots.find((k) => {
        const b = bboxToPixels(k.bbox, imgSize.w, imgSize.h);
        return mx >= b.x && mx <= b.x + b.width && my >= b.y && my <= b.y + b.height;
      });
      if (hit) onKnotClick(hit.id);
    },
    [knots, imgSize, onKnotClick]
  );

  return (
    <div ref={containerRef} className="relative w-full rounded-xl overflow-hidden bg-neutral-950">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`data:${mimeType};base64,${image}`}
        alt={`${face} face`}
        className="w-full block"
        onLoad={(e) => {
          const img = e.currentTarget;
          imgRef.current = img;
          syncCanvas(img);
          onImageLoad?.();
        }}
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0"
        style={{ cursor: "crosshair" }}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => onKnotHover(null)}
        onClick={handleClick}
      />
      <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-neutral-950/70 text-xs font-semibold uppercase tracking-wider text-neutral-400 pointer-events-none">
        {face} face
      </div>
      {knots.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-xs text-neutral-600 bg-neutral-950/60 px-3 py-1.5 rounded-full">
            No knots detected
          </span>
        </div>
      )}
    </div>
  );
}
