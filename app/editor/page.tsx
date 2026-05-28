"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowLeft,
  Boxes,
  LayoutGrid,
  Layers,
  RotateCcw,
  Zap,
  Pencil,
  Download,
  ImageIcon,
  ChevronLeft,
  History,
  BookOpen,
} from "lucide-react";
import type {
  EditableKnot,
  PlankDimensions,
  SurfaceId,
} from "@/lib/plank";
import {
  DEFAULT_DIMENSIONS,
  SURFACE_IDS,
} from "@/lib/plank";
import { SAMPLE_PRESETS } from "@/lib/samples";
import type { Analysis6 } from "@/lib/schema";
import { renderAllSurfaces } from "@/lib/renderSurface";
import { GradeCard } from "@/components/GradeCard";
import { LoadingState } from "@/components/LoadingState";
import { KnotInspector } from "@/components/editor/KnotInspector";
import { PlankSizePanel } from "@/components/editor/PlankSizePanel";
import { SurfaceFlatEditor } from "@/components/editor/SurfaceFlatEditor";
import { SurfaceGallery } from "@/components/editor/SurfaceGallery";
import { DetailedAnalysisPanel } from "@/components/editor/DetailedAnalysisPanel";
import { EditorHistoryPanel } from "@/components/editor/EditorHistoryPanel";
import { generateThumbnail, save6FaceRecord, type SixFaceRecord } from "@/lib/history";

// R3F components — client-only to avoid SSR Three.js issues
const Plank3D = dynamic(
  () => import("@/components/editor/Plank3D").then((m) => m.Plank3D),
  { ssr: false, loading: () => <div className="w-full h-full bg-neutral-950 flex items-center justify-center text-xs text-neutral-600">Loading 3D viewer…</div> }
);
const ResultPlank3D = dynamic(
  () => import("@/components/editor/ResultPlank3D").then((m) => m.ResultPlank3D),
  { ssr: false, loading: () => <div className="w-full h-full bg-neutral-950 flex items-center justify-center text-xs text-neutral-600">Loading 3D viewer…</div> }
);

// We treat Analysis6 as compatible with GradeCard via a small adapter — GradeCard
// only reads estimated_grade, total_knots, through_knot_count, max_knot_diameter_mm,
// and reasoning, all of which live on Analysis6.

type EditMode = "3d" | "flat";
type Phase = "edit" | "preview" | "loading" | "results";

export default function EditorPage() {
  // ── Editor state ──────────────────────────────────────────────────────────
  const [dimensions, setDimensions] = useState<PlankDimensions>(DEFAULT_DIMENSIONS);
  const [knots, setKnots] = useState<EditableKnot[]>([]);
  const [selectedKnotId, setSelectedKnotId] = useState<string | null>(null);
  const [editMode, setEditMode] = useState<EditMode>("3d");
  const [activeSurface, setActiveSurface] = useState<SurfaceId>("front");

  // ── Phase / results state ─────────────────────────────────────────────────
  const [phase, setPhase] = useState<Phase>("edit");
  const [analysis, setAnalysis] = useState<Analysis6 | null>(null);
  const [surfaceImages, setSurfaceImages] = useState<Record<SurfaceId, string> | null>(null);
  const [resultSelected, setResultSelected] = useState<{ surface: SurfaceId; id: number } | null>(null);
  const boardIdRef = useRef(`plank-${Date.now()}`);

  // ── History ───────────────────────────────────────────────────────────────
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyToken, setHistoryToken] = useState(0);

  // ── Sample preset loader (?preset=<id> in URL) ────────────────────────────
  const searchParams = useSearchParams();
  const [samplesOpen, setSamplesOpen] = useState(false);
  useEffect(() => {
    const presetId = searchParams.get("preset");
    if (!presetId) return;
    const preset = SAMPLE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setDimensions(preset.project.dimensions);
    setKnots(preset.project.knots);
    setSelectedKnotId(null);
    setPhase("edit");
  // Only run once on mount (searchParams is stable on first render).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Knot ops ──────────────────────────────────────────────────────────────
  const addKnot = useCallback((knot: EditableKnot) => {
    setKnots((prev) => [...prev, knot]);
    setSelectedKnotId(knot.id);
  }, []);

  const addKnotAtUv = useCallback(
    (surface: SurfaceId, u: number, v: number) => {
      const newKnot: EditableKnot = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        surface, u, v,
        diameter_mm: 20,
        aspect_ratio: 1,
        rotation_deg: 0,
        shape: "circle",
        type: "live",
        darkness: 0.5,
      };
      setKnots((prev) => [...prev, newKnot]);
      setSelectedKnotId(newKnot.id);
      setActiveSurface(surface);
    },
    []
  );

  const updateKnot = useCallback((id: string, patch: Partial<EditableKnot>) => {
    setKnots((prev) => prev.map((k) => (k.id === id ? { ...k, ...patch } : k)));
  }, []);

  const deleteSelectedKnot = useCallback(() => {
    if (!selectedKnotId) return;
    setKnots((prev) => prev.filter((k) => k.id !== selectedKnotId));
    setSelectedKnotId(null);
  }, [selectedKnotId]);

  const selectedKnot = useMemo(
    () => knots.find((k) => k.id === selectedKnotId) ?? null,
    [knots, selectedKnotId]
  );

  // ── Step 1: render the 6 surfaces and show them in a preview ─────────────
  const [generating, setGenerating] = useState(false);
  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    try {
      const rendered = await renderAllSurfaces(dimensions, knots);
      const imageState = {} as Record<SurfaceId, string>;
      for (const s of SURFACE_IDS) imageState[s] = rendered[s].base64;
      setSurfaceImages(imageState);
      setAnalysis(null);
      setResultSelected(null);
      setPhase("preview");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Image generation failed: ${msg}`);
    } finally {
      setGenerating(false);
    }
  }, [dimensions, knots]);

  // ── Step 2: send the previewed images to Gemini for analysis ─────────────
  const handleAnalyze = useCallback(async () => {
    if (!surfaceImages) return;
    setPhase("loading");
    try {
      const payloadSurfaces = {} as Record<SurfaceId, { base64: string; mime: string }>;
      for (const s of SURFACE_IDS) {
        payloadSurfaces[s] = { base64: surfaceImages[s], mime: "image/jpeg" };
      }
      const res = await fetch("/api/analyze6", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dimensions, surfaces: payloadSurfaces }),
      });
      const data = (await res.json()) as unknown;
      if (!res.ok) {
        const err = data as { error?: string };
        throw new Error(err.error ?? "Analysis failed");
      }
      const result = data as Analysis6;
      setAnalysis(result);
      boardIdRef.current = `plank-${Date.now()}`;
      setPhase("results");
      const summary =
        result.total_knots === 0
          ? "No knots detected — clean plank."
          : `Grade ${result.estimated_grade} — ${result.total_knots} knots, ${result.through_knot_count} through-knot${result.through_knot_count !== 1 ? "s" : ""}.`;
      toast.success(summary, { duration: 5000 });

      // Save to history — thumbnails generated async, non-blocking
      (async () => {
        const thumbs = {} as Record<SurfaceId, string>;
        for (const s of SURFACE_IDS) {
          thumbs[s] = await generateThumbnail(surfaceImages[s], "image/jpeg", 220);
        }
        const record: SixFaceRecord = {
          id: boardIdRef.current,
          boardId: boardIdRef.current,
          timestamp: new Date().toISOString(),
          dimensions,
          knots,
          analysis: result,
          thumbs,
        };
        save6FaceRecord(record);
        setHistoryToken((t) => t + 1);
      })();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Analysis failed: ${msg}`);
      setPhase("preview");
    }
  }, [dimensions, surfaceImages]);

  const handleBackToEdit = () => {
    setPhase("edit");
    setResultSelected(null);
  };

  const handleRestoreFromHistory = useCallback((record: SixFaceRecord) => {
    // Restore enough state to show the result phase: dims, knots, analysis,
    // and the thumb-resolution images (3D textures will look softer than fresh
    // renders, which is fine for a historical record). The user can hit
    // "Back to Editor" and "Regenerate" to get full-res renders again.
    setDimensions(record.dimensions);
    setKnots(record.knots);
    setSelectedKnotId(null);
    setAnalysis(record.analysis);
    setSurfaceImages(record.thumbs);
    boardIdRef.current = record.boardId;
    setResultSelected(null);
    setPhase("results");
  }, []);

  const handleClearAll = () => {
    setKnots([]);
    setSelectedKnotId(null);
  };

  const handleExportJson = () => {
    if (!analysis || !surfaceImages) return;
    const payload = {
      knotscope_version: "1.0",
      kind: "6-surface",
      exported_at: new Date().toISOString(),
      board_id: boardIdRef.current,
      dimensions,
      summary: {
        estimated_grade: analysis.estimated_grade,
        total_knots: analysis.total_knots,
        through_knot_count: analysis.through_knot_count,
        max_knot_diameter_mm: analysis.max_knot_diameter_mm,
        reasoning: analysis.reasoning,
      },
      surfaces: analysis.surfaces,
      through_knot_pairs: analysis.pairs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `knotscope-6surface-${boardIdRef.current}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Nav */}
      <nav className="border-b border-neutral-800 px-4 sm:px-6 py-4 flex items-center gap-3">
        <Link
          href="/"
          className="flex items-center gap-1.5 text-sm text-neutral-400 hover:text-neutral-200 transition-colors"
        >
          <ArrowLeft size={15} />
          Back
        </Link>
        <span className="mx-2 text-neutral-700">·</span>
        <Boxes size={18} className="text-amber-500" />
        <span className="font-bold tracking-tight">6-Surface Plank Editor</span>
        <span className="hidden sm:inline text-xs text-neutral-600 ml-2">Demo: AI through-knot reasoning</span>

        {/* Sample presets dropdown */}
        <div className="ml-auto relative">
          <button
            type="button"
            onClick={() => setSamplesOpen((o) => !o)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/40 text-amber-400 hover:border-amber-500 hover:bg-amber-500/10 text-xs font-medium transition-colors"
          >
            <BookOpen size={14} />
            Load Sample
          </button>
          {samplesOpen && (
            <div className="absolute right-0 top-full mt-1 z-50 w-64 bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl overflow-hidden">
              <p className="px-3 pt-2.5 pb-1.5 text-[10px] uppercase tracking-widest text-neutral-600 font-medium">
                Fig 6 Knot Types
              </p>
              {SAMPLE_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setDimensions(preset.project.dimensions);
                    setKnots(preset.project.knots);
                    setSelectedKnotId(null);
                    setPhase("edit");
                    setSamplesOpen(false);
                  }}
                  className="w-full px-3 py-2.5 text-left hover:bg-neutral-800 transition-colors flex flex-col gap-0.5"
                >
                  <span className="text-sm font-medium text-neutral-200">{preset.label}</span>
                  <span className="text-[10px] text-neutral-500 leading-snug line-clamp-2">{preset.description}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-neutral-200 text-xs font-medium transition-colors"
        >
          <History size={14} />
          History
        </button>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {phase === "loading" && <LoadingState />}

        {phase === "preview" && surfaceImages && (
          <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-end gap-3 sm:gap-6">
              <div className="flex-1">
                <h2 className="text-xl sm:text-2xl font-bold mb-1">Step 1 · Generated Surface Photos</h2>
                <p className="text-neutral-500 text-sm">
                  These six images were rendered from your editor. They&apos;re what gets sent to Gemini
                  &mdash; the AI does <span className="text-amber-400">not</span> see your 3D model, only these photos.
                </p>
              </div>
              <div className="text-xs text-neutral-600 sm:text-right">
                <div>Plank: {dimensions.length_mm} × {dimensions.width_mm} × {dimensions.thickness_mm} mm</div>
                <div>{knots.length} knot{knots.length !== 1 ? "s" : ""} placed</div>
              </div>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
              <SurfaceGallery
                dimensions={dimensions}
                surfaceImages={surfaceImages}
              />
            </div>

            <div className="flex gap-3 flex-wrap">
              <button
                type="button"
                onClick={handleAnalyze}
                className="flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 text-neutral-950 font-bold text-sm hover:bg-amber-400 active:scale-[0.98] transition-all min-h-[48px]"
              >
                <Zap size={16} />
                Step 2 · Analyse with AI
              </button>
              <button
                type="button"
                onClick={handleBackToEdit}
                className="flex items-center gap-2 px-5 py-3 rounded-xl border border-neutral-700 text-neutral-300 font-semibold hover:border-neutral-500 transition-colors min-h-[44px]"
              >
                <ChevronLeft size={16} />
                Back to Editor
              </button>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="flex items-center gap-2 px-5 py-3 rounded-xl border border-neutral-800 text-neutral-400 font-semibold hover:border-neutral-600 hover:text-neutral-200 transition-colors min-h-[44px]"
              >
                <ImageIcon size={16} />
                {generating ? "Regenerating…" : "Regenerate"}
              </button>
            </div>
          </div>
        )}

        {phase === "edit" && (
          <div className="flex flex-col xl:flex-row gap-4 xl:gap-6">
            {/* Left rail: plank size */}
            <div className="xl:w-64 flex flex-col gap-4 shrink-0">
              <PlankSizePanel dimensions={dimensions} onChange={setDimensions} />

              {/* Mode toggle */}
              <div className="bg-neutral-900 rounded-2xl border border-neutral-800 p-3 flex flex-col gap-2">
                <span className="text-xs uppercase tracking-wider text-neutral-500 px-1">View</span>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setEditMode("3d")}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                      editMode === "3d"
                        ? "bg-amber-500 text-neutral-950"
                        : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"
                    }`}
                  >
                    <Layers size={13} />
                    3D
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditMode("flat")}
                    className={`flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs font-medium transition-colors ${
                      editMode === "flat"
                        ? "bg-amber-500 text-neutral-950"
                        : "bg-neutral-800 text-neutral-400 hover:text-neutral-200"
                    }`}
                  >
                    <LayoutGrid size={13} />
                    Flat
                  </button>
                </div>

                {editMode === "flat" && (
                  <div className="flex flex-col gap-1 mt-1">
                    <span className="text-[10px] uppercase tracking-wider text-neutral-600 px-1">Surface</span>
                    <select
                      value={activeSurface}
                      onChange={(e) => setActiveSurface(e.target.value as SurfaceId)}
                      className="bg-neutral-800 border border-neutral-700 rounded-lg text-xs py-1.5 px-2 text-neutral-200"
                    >
                      {SURFACE_IDS.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* Clear all */}
              {knots.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearAll}
                  className="text-xs text-neutral-500 hover:text-red-400 transition-colors text-left px-1"
                >
                  Clear all knots ({knots.length})
                </button>
              )}
            </div>

            {/* Center: editor viewport */}
            <div className="flex-1 min-w-0 flex flex-col gap-4">
              <div className="rounded-2xl border border-neutral-800 overflow-hidden bg-neutral-900" style={{ height: "60vh", minHeight: 400 }}>
                {editMode === "3d" ? (
                  <Plank3D
                    dimensions={dimensions}
                    knots={knots}
                    selectedKnotId={selectedKnotId}
                    onAddKnot={addKnotAtUv}
                    onSelectKnot={setSelectedKnotId}
                    onSelectSurface={setActiveSurface}
                  />
                ) : (
                  <div className="w-full h-full p-4 overflow-auto flex items-center justify-center">
                    <SurfaceFlatEditor
                      surface={activeSurface}
                      dimensions={dimensions}
                      knots={knots}
                      selectedKnotId={selectedKnotId}
                      onAddKnot={addKnot}
                      onUpdateKnot={updateKnot}
                      onSelectKnot={setSelectedKnotId}
                    />
                  </div>
                )}
              </div>

              {/* Generate CTA — Step 1: render 6 wood images */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleGenerate}
                  disabled={knots.length === 0 || generating}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 text-neutral-950 font-bold text-sm hover:bg-amber-400 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed min-h-[48px]"
                >
                  <ImageIcon size={16} />
                  {generating ? "Generating…" : "Generate Images"}
                </button>
                <p className="text-xs text-neutral-500">
                  {knots.length === 0
                    ? "Add at least one knot, then generate the 6 surface photos."
                    : `${knots.length} knot${knots.length !== 1 ? "s" : ""} across ${new Set(knots.map((k) => k.surface)).size} surface${new Set(knots.map((k) => k.surface)).size !== 1 ? "s" : ""}. Step 1: render → Step 2: AI analyse.`}
                </p>
              </div>
            </div>

            {/* Right rail: knot inspector */}
            <div className="xl:w-72 shrink-0">
              <KnotInspector
                knot={selectedKnot}
                onUpdate={(patch) => selectedKnot && updateKnot(selectedKnot.id, patch)}
                onDelete={deleteSelectedKnot}
              />
            </div>
          </div>
        )}

        {phase === "results" && analysis && surfaceImages && (
          <div className="flex flex-col gap-6">
            {/* Header row */}
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-start">
              <div className="flex-1">
                <h2 className="text-xl sm:text-2xl font-bold mb-1">6-Surface Analysis Complete</h2>
                <p className="text-neutral-500 text-sm">
                  Plank ID:{" "}
                  <span className="font-mono text-neutral-400">{boardIdRef.current}</span>
                  <span className="mx-2 text-neutral-700">·</span>
                  {dimensions.length_mm} × {dimensions.width_mm} × {dimensions.thickness_mm} mm
                </p>
              </div>
              <div className="w-full sm:w-72">
                {/* GradeCard works with Analysis6 since it only reads grade/stat fields */}
                <GradeCard analysis={analysis as unknown as Parameters<typeof GradeCard>[0]["analysis"]} />
              </div>
            </div>

            {/* 3D hero */}
            <div className="rounded-2xl border border-neutral-800 overflow-hidden bg-neutral-900" style={{ height: "55vh", minHeight: 380 }}>
              <ResultPlank3D
                analysis={analysis}
                dimensions={dimensions}
                surfaceImages={surfaceImages}
                selectedKnot={resultSelected}
              />
            </div>

            <p className="text-xs text-neutral-500 -mt-2 text-center">
              Drag to rotate the 3D plank. Amber lines pass through the plank where Gemini matched through-knots.
            </p>

            {/* 2D gallery — opposite pairs side by side */}
            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
              <h3 className="text-sm font-semibold text-neutral-300 mb-1">Detected knots & matched pairs</h3>
              <p className="text-xs text-neutral-600 mb-4">
                Each row shows a pair of opposite faces. Amber dashed lines connect through-knots Gemini matched.
              </p>
              <SurfaceGallery
                analysis={analysis}
                dimensions={dimensions}
                surfaceImages={surfaceImages}
                selectedKnot={resultSelected}
                onSelectKnot={setResultSelected}
              />
            </div>

            {/* Detailed AI report */}
            <DetailedAnalysisPanel
              headline={analysis.reasoning}
              detail={analysis.detailed_analysis}
            />

            <div className="flex gap-3 flex-wrap">
              <button
                type="button"
                onClick={handleExportJson}
                className="flex items-center gap-2 px-5 py-3 rounded-xl border border-neutral-700 text-neutral-200 font-semibold hover:border-amber-500/50 transition-colors min-h-[44px]"
              >
                <Download size={16} />
                Export JSON
              </button>
              <button
                type="button"
                onClick={handleBackToEdit}
                className="flex items-center gap-2 px-5 py-3 rounded-xl bg-amber-500 text-neutral-950 font-semibold hover:bg-amber-400 active:scale-[0.98] transition-all min-h-[44px]"
              >
                <Pencil size={16} />
                Back to Editor
              </button>
              <button
                type="button"
                onClick={() => {
                  handleClearAll();
                  setPhase("edit");
                }}
                className="flex items-center gap-2 px-5 py-3 rounded-xl border border-neutral-700 text-neutral-300 font-semibold hover:border-neutral-500 transition-colors min-h-[44px]"
              >
                <RotateCcw size={16} />
                New Plank
              </button>
            </div>
          </div>
        )}
      </main>

      <EditorHistoryPanel
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onRestore={handleRestoreFromHistory}
        refreshToken={historyToken}
      />
    </div>
  );
}
