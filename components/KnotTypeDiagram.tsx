"use client";

import { useEffect, useState } from "react";
import { Zap, ChevronRight, Layers } from "lucide-react";
import { SAMPLE_PRESETS, DIAGRAM_ROWS } from "@/lib/samples";
import type { SurfaceId } from "@/lib/plank";
import { SURFACE_IDS } from "@/lib/plank";

// ── SVG board dimensions (all board sketches share one viewBox) ───────────────
const W = 300;
const H = 52;
const WOOD = "#d4a57a";
const GRAIN = "#a07040";
const KNOT = "#d97706";
const KNOT_D = "#92400e";
const BORDER = "#6b3a12";
const EDGE = "#b07848";

// ── Board SVG wrapper ─────────────────────────────────────────────────────────

function Board({ children, selected }: { children?: React.ReactNode; selected?: boolean }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" style={{ display: "block" }}>
      {/* Wood face */}
      <rect x={0} y={0} width={W} height={H} fill={WOOD} />
      {/* Top edge strip (shows the board thickness) */}
      <rect x={0} y={0} width={W} height={7} fill={EDGE} />
      {/* Bottom edge strip */}
      <rect x={0} y={H - 7} width={W} height={7} fill={EDGE} />
      {/* Grain lines on face */}
      <path d={`M0 19 Q${W / 2} 17 ${W} 19`} stroke={GRAIN} strokeWidth="0.55" fill="none" opacity="0.5" />
      <path d={`M0 29 Q${W / 2} 31 ${W} 29`} stroke={GRAIN} strokeWidth="0.55" fill="none" opacity="0.5" />
      <path d={`M0 38 Q${W / 2} 36 ${W} 38`} stroke={GRAIN} strokeWidth="0.55" fill="none" opacity="0.5" />
      {/* Knot shapes */}
      {children}
      {/* Board outline */}
      <rect x={0} y={0} width={W} height={H} fill="none" stroke={selected ? "#f59e0b" : BORDER} strokeWidth={selected ? 2 : 1.5} />
    </svg>
  );
}

// ── Per-case SVG knot shapes ──────────────────────────────────────────────────

const SHAPES: Record<string, React.ReactNode> = {
  // Row 1 ─────────────────────────────────────────────────────────────────────

  "face-spike": (
    // Long lance/spike knot on the broad face, slightly angled
    <Board>
      <ellipse cx={148} cy={24} rx={72} ry={8}
        transform="rotate(6, 148, 24)"
        fill={KNOT} stroke={KNOT_D} strokeWidth="1" />
    </Board>
  ),

  "arris-spike": (
    // Spike arris knot: triangular wedge at top edge of face + on edge strip
    <Board>
      <polygon points="178,7 240,7 205,27"
        fill={KNOT} stroke={KNOT_D} strokeWidth="1" />
      {/* Also shows on top edge strip */}
      <ellipse cx={209} cy={3} rx={30} ry={3}
        fill={KNOT} stroke={KNOT_D} strokeWidth="0.7" opacity={0.85} />
    </Board>
  ),

  "edge-spike": (
    // Spike mostly on the narrow top edge — only the very tip touches the face corner
    <Board>
      {/* Narrow spike on top edge strip */}
      <polygon points="220,0 290,0 285,7 225,7"
        fill={KNOT} stroke={KNOT_D} strokeWidth="0.8" />
      {/* Tiny tip at face corner */}
      <polygon points="285,7 290,7 290,13"
        fill={KNOT} stroke={KNOT_D} strokeWidth="0.8" opacity={0.75} />
    </Board>
  ),

  // Row 2 ─────────────────────────────────────────────────────────────────────

  "splay-narrow": (
    // Narrow splay: parallelogram band crossing the full face height, ~20 px wide
    <Board>
      <polygon points="118,7 134,7 131,45 115,45"
        fill={KNOT} stroke={KNOT_D} strokeWidth="1" />
    </Board>
  ),

  "splay-medium": (
    // Medium splay: band ~40 px wide
    <Board>
      <polygon points="120,7 158,7 152,45 114,45"
        fill={KNOT} stroke={KNOT_D} strokeWidth="1" />
    </Board>
  ),

  "splay-wide": (
    // Wide splay: band ~75 px wide, spanning most of the face height
    <Board>
      <polygon points="110,7 185,7 173,45 98,45"
        fill={KNOT} stroke={KNOT_D} strokeWidth="1" />
    </Board>
  ),

  // Row 3 ─────────────────────────────────────────────────────────────────────

  "spike-longitudinal": (
    // Very long spike running along the grain
    <Board>
      <ellipse cx={150} cy={21} rx={130} ry={8}
        fill={KNOT} stroke={KNOT_D} strokeWidth="1" />
    </Board>
  ),

  // Row 4 ─────────────────────────────────────────────────────────────────────

  "arris-single": (
    // Single arris knot: triangle at top-left where face meets long edge
    <Board>
      <polygon points="50,7 120,7 50,38"
        fill={KNOT} stroke={KNOT_D} strokeWidth="1" />
      {/* Shows on edge strip too */}
      <ellipse cx={82} cy={3} rx={32} ry={3}
        fill={KNOT} stroke={KNOT_D} strokeWidth="0.7" opacity={0.85} />
    </Board>
  ),

  "arris-compound": (
    // Compound arris: two adjacent triangles at bottom edge (min1 + min2)
    <Board>
      <polygon points="108,45 174,45 108,13"
        fill={KNOT} stroke={KNOT_D} strokeWidth="1" />
      <polygon points="174,45 230,45 230,22"
        fill={KNOT} stroke={KNOT_D} strokeWidth="1" />
      {/* Edge strip highlights */}
      <ellipse cx={166} cy={49} rx={60} ry={3}
        fill={KNOT} stroke={KNOT_D} strokeWidth="0.7" opacity={0.8} />
    </Board>
  ),

  "arris-corner": (
    // Corner arris: large triangle at top-right corner spanning face + end
    <Board>
      <polygon points="222,7 300,7 300,45"
        fill={KNOT} stroke={KNOT_D} strokeWidth="1" />
      {/* Shows on top edge strip */}
      <polygon points="228,0 300,0 300,7 222,7"
        fill={KNOT} stroke={KNOT_D} strokeWidth="0.8" opacity={0.85} />
    </Board>
  ),
};

// ── Detail panel — images + analyze button ───────────────────────────────────

interface DetailPanelProps {
  presetId: string;
  onAnalyze: (surfaces: Record<SurfaceId, string>) => void;
  analyzing: boolean;
}

const SURFACE_LABELS: Record<SurfaceId, string> = {
  front: "Front", back: "Back", top: "Top",
  bottom: "Bottom", left: "Left", right: "Right",
};

function DetailPanel({ presetId, onAnalyze, analyzing }: DetailPanelProps) {
  const preset = SAMPLE_PRESETS.find((p) => p.id === presetId);
  const [images, setImages] = useState<Partial<Record<SurfaceId, string>>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setImages({});
    let cancelled = false;
    (async () => {
      const out: Partial<Record<SurfaceId, string>> = {};
      for (const sid of SURFACE_IDS) {
        try {
          const res = await fetch(`/samples/${presetId}-${sid}.jpg`);
          if (!res.ok) continue;
          const blob = await res.blob();
          const b64 = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) =>
              resolve(((e.target?.result as string) ?? "").split(",")[1] ?? "");
            reader.readAsDataURL(blob);
          });
          if (!cancelled) {
            out[sid] = b64;
            setImages({ ...out });
          }
        } catch { /* image not yet generated */ }
      }
      if (!cancelled) setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [presetId]);

  if (!preset) return null;

  const allLoaded = SURFACE_IDS.every((s) => images[s]);
  const surfaceImages = images as Record<SurfaceId, string>;

  return (
    <div className="border border-amber-500/30 rounded-2xl bg-neutral-900 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-neutral-800 flex items-start gap-3">
        <ChevronRight size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <h3 className="font-bold text-neutral-100">{preset.label}</h3>
          <p className="text-sm text-neutral-400 leading-relaxed mt-0.5">{preset.description}</p>
        </div>
      </div>

      {/* 6 surface images */}
      <div className="px-5 py-4">
        <p className="text-xs uppercase tracking-widest text-neutral-600 mb-3">
          Example — 6 rendered surfaces
        </p>
        {loading && !allLoaded ? (
          <div className="h-20 flex items-center justify-center">
            <span className="text-xs text-neutral-600 animate-pulse">Loading surface images…</span>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {(["front", "back", "top", "bottom", "left", "right"] as SurfaceId[]).map((sid) => (
              <div key={sid} className="flex flex-col gap-1">
                <span className="text-[10px] text-neutral-500 uppercase tracking-wider">
                  {SURFACE_LABELS[sid]}
                </span>
                {images[sid] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`data:image/jpeg;base64,${images[sid]}`}
                    alt={`${sid} surface`}
                    className="w-full object-cover border border-neutral-800 bg-neutral-950"
                    style={{ aspectRatio: sid === "front" || sid === "back" ? "16/1" : sid === "top" || sid === "bottom" ? "96/6" : "6/1" }}
                  />
                ) : (
                  <div
                    className="w-full bg-neutral-800 border border-neutral-700 flex items-center justify-center"
                    style={{ aspectRatio: "8/1" }}
                  >
                    <span className="text-[9px] text-neutral-600">not generated</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Analyze button */}
      <div className="px-5 pb-5">
        <button
          type="button"
          disabled={!allLoaded || analyzing}
          onClick={() => allLoaded && onAnalyze(surfaceImages)}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-amber-500 text-neutral-950
            font-bold text-sm hover:bg-amber-400 active:scale-[0.98] transition-all
            disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Zap size={15} />
          {analyzing ? "Analysing…" : allLoaded ? "Analyse with AI →" : "Loading images…"}
        </button>
        {!allLoaded && !loading && (
          <p className="text-[10px] text-neutral-600 text-center mt-2">
            Sample images not yet generated — run <code className="bg-neutral-800 px-1 rounded">/generate-samples</code> in dev.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Main diagram component ───────────────────────────────────────────────────

interface KnotTypeDiagramProps {
  onAnalyze: (presetId: string, surfaces: Record<SurfaceId, string>) => void;
  analyzing: boolean;
  analyzingPresetId: string | null;
}

export function KnotTypeDiagram({ onAnalyze, analyzing, analyzingPresetId }: KnotTypeDiagramProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleAnalyze = (surfaces: Record<SurfaceId, string>) => {
    if (!selectedId) return;
    onAnalyze(selectedId, surfaces);
  };

  return (
    <div className="flex flex-col gap-8">

      {/* Row groups */}
      {DIAGRAM_ROWS.map((row) => (
        <div key={row.label} className="flex flex-col gap-3">
          {/* Row header */}
          <div className="flex flex-col gap-0.5">
            <h3 className="text-sm font-semibold text-neutral-200 flex items-center gap-2">
              <Layers size={13} className="text-amber-500 flex-shrink-0" />
              {row.label}
            </h3>
            <p className="text-xs text-neutral-500 pl-5">{row.subtitle}</p>
          </div>

          {/* Board sketches for this row */}
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${row.caseIds.length}, minmax(0, 1fr))` }}>
            {row.caseIds.map((caseId) => {
              const preset = SAMPLE_PRESETS.find((p) => p.id === caseId);
              if (!preset) return null;
              const selected = selectedId === caseId;
              const isAnalyzing = analyzing && analyzingPresetId === caseId;

              return (
                <button
                  key={caseId}
                  type="button"
                  onClick={() => setSelectedId(selected ? null : caseId)}
                  className={`flex flex-col gap-2 rounded-xl p-2 transition-all text-left
                    ${selected
                      ? "bg-amber-500/10 ring-1 ring-amber-500/60"
                      : "hover:bg-neutral-800/60"
                    }`}
                >
                  {/* Board sketch */}
                  <div
                    className="w-full overflow-hidden rounded-sm"
                    style={{ aspectRatio: `${W}/${H}` }}
                  >
                    {SHAPES[caseId] ?? (
                      <Board selected={selected}>
                        <text x={W / 2} y={H / 2 + 4} textAnchor="middle"
                          fill="#6b7280" fontSize="8">no shape</text>
                      </Board>
                    )}
                  </div>

                  {/* Label */}
                  <div className="px-0.5 flex items-center gap-1.5">
                    <span className={`text-xs font-medium leading-tight ${selected ? "text-amber-300" : "text-neutral-400"}`}>
                      {preset.shortLabel}
                    </span>
                    {isAnalyzing && (
                      <span className="text-[9px] text-amber-500 animate-pulse">analysing…</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Detail panel — slides in when a case is selected */}
      {selectedId && (
        <DetailPanel
          presetId={selectedId}
          onAnalyze={handleAnalyze}
          analyzing={analyzing && analyzingPresetId === selectedId}
        />
      )}
    </div>
  );
}
