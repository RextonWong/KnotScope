"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { DropZone } from "@/components/DropZone";
import { AnalysisCanvas } from "@/components/AnalysisCanvas";
import { GradeCard } from "@/components/GradeCard";
import { KnotDetailPanel } from "@/components/KnotDetailPanel";
import { LoadingState } from "@/components/LoadingState";
import { KnotTypeDiagram } from "@/components/KnotTypeDiagram";
import { SurfaceGallery } from "@/components/editor/SurfaceGallery";
import { DetailedAnalysisPanel } from "@/components/editor/DetailedAnalysisPanel";
import { bboxCenter } from "@/lib/bbox";
import { TreePine, Zap, RotateCcw, Download, PanelRight, History, FileJson, Boxes, Upload, Layers } from "lucide-react";
import Link from "next/link";
import type { Analysis, Analysis6 } from "@/lib/schema";
import type { SurfaceId } from "@/lib/plank";
import { SURFACE_IDS } from "@/lib/plank";
import { HistoryPanel } from "@/components/HistoryPanel";
import { generateThumbnail, saveRecord, exportRecordJson, type HistoryRecord } from "@/lib/history";

type AppState = "empty" | "loading" | "results";
type UploadMode = "2face" | "6face";

function detectMime(b64: string): string {
  try {
    const bin = atob(b64.slice(0, 16));
    const b0 = bin.charCodeAt(0), b1 = bin.charCodeAt(1), b2 = bin.charCodeAt(2);
    if (b0 === 0xff && b1 === 0xd8) return "image/jpeg";
    if (b0 === 0x89 && b1 === 0x50 && b2 === 0x4e) return "image/png";
    if (b0 === 0x52 && b1 === 0x49 && b2 === 0x46) return "image/webp";
    if (b0 === 0x47 && b1 === 0x49 && b2 === 0x46) return "image/gif";
  } catch { /* fall through */ }
  return "image/jpeg";
}

function b64Bytes(b64: string) { return Math.ceil((b64.length * 3) / 4); }

// ── Pair SVG overlay (2-face results) ────────────────────────────────────────

interface PairLine { frontId: number; backId: number; confidence: number }

interface PairOverlayProps {
  frontImage: string; frontMime: string;
  backImage: string; backMime: string;
  analysis: Analysis;
  pairLines: PairLine[];
  hoveredKnot: { face: "front" | "back"; id: number } | null;
  selectedKnot: { face: "front" | "back"; id: number } | null;
  onKnotHover: (face: "front" | "back", id: number | null) => void;
  onKnotClick: (face: "front" | "back", id: number) => void;
}

function PairOverlay({
  frontImage, frontMime, backImage, backMime,
  analysis, pairLines, hoveredKnot, selectedKnot, onKnotHover, onKnotClick,
}: PairOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [frontRect, setFrontRect] = useState({ w: 0, h: 0, left: 0, top: 0 });
  const [backRect, setBackRect] = useState({ w: 0, h: 0, left: 0, top: 0 });
  const loadedRef = useRef({ front: false, back: false });

  const measureRects = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const frontEl = container.querySelector<HTMLElement>("[data-face='front']");
    const backEl = container.querySelector<HTMLElement>("[data-face='back']");
    if (!frontEl || !backEl) return;
    const cr = container.getBoundingClientRect();
    const fr = frontEl.getBoundingClientRect();
    const br = backEl.getBoundingClientRect();
    setFrontRect({ w: fr.width, h: fr.height, left: fr.left - cr.left, top: fr.top - cr.top });
    setBackRect({ w: br.width, h: br.height, left: br.left - cr.left, top: br.top - cr.top });
  }, []);

  const handleFrontLoad = useCallback(() => {
    loadedRef.current.front = true;
    if (loadedRef.current.back) measureRects();
  }, [measureRects]);

  const handleBackLoad = useCallback(() => {
    loadedRef.current.back = true;
    if (loadedRef.current.front) measureRects();
  }, [measureRects]);

  useEffect(() => {
    window.addEventListener("resize", measureRects);
    return () => window.removeEventListener("resize", measureRects);
  }, [measureRects]);

  useEffect(() => { loadedRef.current = { front: false, back: false }; }, [frontImage, backImage]);

  const svgLines = pairLines.flatMap((p) => {
    const fKnot = analysis.front.find((k) => k.id === p.frontId);
    const bKnot = analysis.back.find((k) => k.id === p.backId);
    if (!fKnot || !bKnot || frontRect.w === 0 || backRect.w === 0) return [];
    const fc = bboxCenter(fKnot.bbox, frontRect.w, frontRect.h);
    const bc = bboxCenter(bKnot.bbox, backRect.w, backRect.h);
    const isActive =
      (hoveredKnot?.face === "front" && hoveredKnot.id === p.frontId) ||
      (hoveredKnot?.face === "back" && hoveredKnot.id === p.backId) ||
      (selectedKnot?.face === "front" && selectedKnot.id === p.frontId) ||
      (selectedKnot?.face === "back" && selectedKnot.id === p.backId);
    return [{
      x1: frontRect.left + fc.x, y1: frontRect.top + fc.y,
      x2: backRect.left + bc.x, y2: backRect.top + bc.y,
      opacity: isActive ? 1 : 0.4,
      stroke: isActive ? "#f59e0b" : "#d97706",
      strokeWidth: isActive ? 2.5 : 1.5,
    }];
  });

  return (
    <div ref={containerRef} className="relative w-full">
      <svg className="absolute inset-0 w-full h-full pointer-events-none z-10" style={{ overflow: "visible" }}>
        {svgLines.map((l, i) => (
          <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke={l.stroke} strokeWidth={l.strokeWidth} opacity={l.opacity}
            strokeDasharray="5 3" strokeLinecap="round" />
        ))}
      </svg>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div data-face="front">
          <AnalysisCanvas image={frontImage} mimeType={frontMime} knots={analysis.front} face="front"
            hoveredId={hoveredKnot?.face === "front" ? hoveredKnot.id : null}
            selectedId={selectedKnot?.face === "front" ? selectedKnot.id : null}
            onKnotHover={(id) => onKnotHover("front", id)} onKnotClick={(id) => onKnotClick("front", id)}
            onImageLoad={handleFrontLoad} />
        </div>
        <div data-face="back">
          <AnalysisCanvas image={backImage} mimeType={backMime} knots={analysis.back} face="back"
            hoveredId={hoveredKnot?.face === "back" ? hoveredKnot.id : null}
            selectedId={selectedKnot?.face === "back" ? selectedKnot.id : null}
            onKnotHover={(id) => onKnotHover("back", id)} onKnotClick={(id) => onKnotClick("back", id)}
            onImageLoad={handleBackLoad} />
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function Home() {

  // ── 6-face diagram/analysis state ────────────────────────────────────────
  const [state6, setState6] = useState<AppState>("empty");
  const [analysis6, setAnalysis6] = useState<Analysis6 | null>(null);
  const [diagImages, setDiagImages] = useState<Record<SurfaceId, string> | null>(null);
  const [selected6, setSelected6] = useState<{ surface: SurfaceId; id: number } | null>(null);
  const [analyzingPresetId, setAnalyzingPresetId] = useState<string | null>(null);

  // ── 2-face upload state ──────────────────────────────────────────────────
  const [uploadMode, setUploadMode] = useState<UploadMode>("2face");
  const [state2, setState2] = useState<AppState>("empty");
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);
  const [analysis2, setAnalysis2] = useState<Analysis | null>(null);
  const [hoveredKnot, setHoveredKnot] = useState<{ face: "front" | "back"; id: number } | null>(null);
  const [selectedKnot, setSelectedKnot] = useState<{ face: "front" | "back"; id: number } | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [images6Upload, setImages6Upload] = useState<Partial<Record<SurfaceId, string>>>({});

  // ── Shared ────────────────────────────────────────────────────────────────
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyToken, setHistoryToken] = useState(0);
  const boardIdRef = useRef(`board-${Date.now()}`);
  const currentRecordRef = useRef<HistoryRecord | null>(null);

  const frontMime = frontImage ? detectMime(frontImage) : "image/jpeg";
  const backMime = backImage ? detectMime(backImage) : "image/jpeg";
  const canAnalyze2 = frontImage !== null && backImage !== null;
  const canAnalyze6Upload = SURFACE_IDS.every((s) => images6Upload[s] != null);

  // ── Diagram-triggered 6-face analysis ───────────────────────────────────
  const handleDiagramAnalyze = async (presetId: string, surfaces: Record<SurfaceId, string>) => {
    setAnalyzingPresetId(presetId);
    setState6("loading");
    setSelected6(null);
    setDiagImages(surfaces);
    try {
      const res = await fetch("/api/analyze6", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surfaces: Object.fromEntries(
            SURFACE_IDS.map((s) => [s, { base64: surfaces[s], mime: "image/jpeg" }])
          ),
          dimensions: { length_mm: 2400, width_mm: 150, thickness_mm: 25 },
        }),
      });
      const data = await res.json() as unknown;
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Analysis failed");
      const result = data as Analysis6;
      setAnalysis6(result);
      setState6("results");
      toast.success(
        `Grade ${result.estimated_grade} — ${result.total_knots} knot${result.total_knots !== 1 ? "s" : ""} found.`,
        { duration: 5000 }
      );
    } catch (err) {
      toast.error(`Analysis failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      setState6("empty");
    } finally {
      setAnalyzingPresetId(null);
    }
  };

  const handleReset6 = () => {
    setState6("empty");
    setAnalysis6(null);
    setDiagImages(null);
    setSelected6(null);
  };

  // ── 2-face analysis ───────────────────────────────────────────────────────
  const handleAnalyze2 = async () => {
    if (!frontImage || !backImage) return;
    const frontMB = b64Bytes(frontImage) / 1_048_576;
    const backMB = b64Bytes(backImage) / 1_048_576;
    if (frontMB > 3 || backMB > 3) {
      toast.warning(`Large images detected (${frontMB.toFixed(1)} MB / ${backMB.toFixed(1)} MB). Analysis may be slow.`, { duration: 6000 });
    }
    setState2("loading");
    setSelectedKnot(null);
    setHoveredKnot(null);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frontImage, backImage }),
      });
      const data = await res.json() as unknown;
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Analysis failed");
      const result = data as Analysis;
      setAnalysis2(result);
      setState2("results");
      boardIdRef.current = `board-${Date.now()}`;
      const fMime = detectMime(frontImage);
      const bMime = detectMime(backImage);
      Promise.all([generateThumbnail(frontImage, fMime), generateThumbnail(backImage, bMime)])
        .then(([frontThumb, backThumb]) => {
          const record: HistoryRecord = {
            id: boardIdRef.current, boardId: boardIdRef.current,
            timestamp: new Date().toISOString(), analysis: result,
            frontThumb, backThumb, frontMime: fMime, backMime: bMime,
          };
          currentRecordRef.current = record;
          saveRecord(record);
          setHistoryToken((t) => t + 1);
        });
      if (result.total_knots === 0) {
        toast.info("No knots detected — the board appears clear.", { duration: 5000 });
      } else {
        toast.success(
          `Grade ${result.estimated_grade} — ${result.total_knots} knot${result.total_knots !== 1 ? "s" : ""} found, ${result.through_knot_count} through.`,
          { duration: 5000 }
        );
      }
    } catch (err) {
      toast.error(`Analysis failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      setState2("empty");
    }
  };

  // ── 6-face upload analysis ────────────────────────────────────────────────
  const handleAnalyze6Upload = async () => {
    if (!canAnalyze6Upload) return;
    setState6("loading");
    setSelected6(null);
    setDiagImages(images6Upload as Record<SurfaceId, string>);
    try {
      const res = await fetch("/api/analyze6", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          surfaces: Object.fromEntries(
            SURFACE_IDS.map((s) => [s, { base64: images6Upload[s], mime: "image/jpeg" }])
          ),
          dimensions: { length_mm: 2400, width_mm: 150, thickness_mm: 25 },
        }),
      });
      const data = await res.json() as unknown;
      if (!res.ok) throw new Error((data as { error?: string }).error ?? "Analysis failed");
      setAnalysis6(data as Analysis6);
      setState6("results");
      toast.success(`Grade ${(data as Analysis6).estimated_grade} — ${(data as Analysis6).total_knots} knots found.`, { duration: 5000 });
    } catch (err) {
      toast.error(`Analysis failed: ${err instanceof Error ? err.message : "Unknown error"}`);
      setState6("empty");
    }
  };

  const handleReset2 = () => {
    setState2("empty"); setFrontImage(null); setBackImage(null);
    setAnalysis2(null); setSelectedKnot(null); setHoveredKnot(null);
    setDetailOpen(false); currentRecordRef.current = null;
  };

  const handleRestore = (record: HistoryRecord) => {
    setFrontImage(record.frontThumb); setBackImage(record.backThumb);
    setAnalysis2(record.analysis); boardIdRef.current = record.boardId;
    currentRecordRef.current = record; setState2("results");
    setSelectedKnot(null); setHoveredKnot(null); setDetailOpen(false);
  };

  const handleExportJson = () => { if (currentRecordRef.current) exportRecordJson(currentRecordRef.current); };

  const handleDownloadPdf = async () => {
    if (!analysis2 || !frontImage || !backImage) return;
    setDownloadingPdf(true);
    const toastId = toast.loading("Generating PDF report…");
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis: analysis2, frontImage, backImage, boardId: boardIdRef.current }),
      });
      if (!res.ok) throw new Error("Failed to generate PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `knotscope-${boardIdRef.current}.pdf`; a.click();
      URL.revokeObjectURL(url);
      toast.success("Report downloaded.", { id: toastId });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "PDF generation failed", { id: toastId });
    } finally { setDownloadingPdf(false); }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && state2 === "empty" && canAnalyze2) handleAnalyze2();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state2, canAnalyze2]);

  const isLoading = state2 === "loading" || state6 === "loading";

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">

      {/* Nav */}
      <nav className="border-b border-neutral-800 px-4 sm:px-6 py-4 flex items-center gap-3">
        <TreePine size={20} className="text-amber-500 flex-shrink-0" />
        <span className="font-bold text-lg tracking-tight">KnotScope</span>
        <span className="hidden sm:inline text-xs text-neutral-600 font-medium ml-1">Lumber Inspection AI</span>
        <Link
          href="/editor"
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-500/40 text-amber-400 hover:border-amber-500 hover:bg-amber-500/10 text-xs font-medium transition-colors"
        >
          <Boxes size={14} />
          6-Surface Editor
        </Link>
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-neutral-200 text-xs font-medium transition-colors"
        >
          <History size={14} />
          History
        </button>
      </nav>

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12 flex flex-col gap-12">

        {/* ── HERO ── */}
        {state6 === "empty" && state2 === "empty" && (
          <div className="text-center flex flex-col items-center gap-2">
            <h1 className="text-3xl sm:text-4xl font-black tracking-tight">KnotScope</h1>
            <p className="text-neutral-400 text-sm sm:text-base max-w-xl leading-relaxed">
              Identify knot types, then let AI inspect all six faces of your board,
              pair through-knots, and compute a structural grade in seconds.
            </p>
          </div>
        )}

        {/* ── LOADING ── */}
        {isLoading && <LoadingState />}

        {/* ── 6-FACE RESULTS (from diagram or upload) ── */}
        {state6 === "results" && analysis6 && diagImages && (
          <div className="flex flex-col gap-6 sm:gap-8">
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-start">
              <div className="flex-1">
                <h2 className="text-xl sm:text-2xl font-bold mb-1">AI Analysis Complete</h2>
                <p className="text-neutral-500 text-sm">All six surfaces analysed — knots detected, through-knot pairs identified.</p>
              </div>
              <div className="w-full sm:w-72">
                <GradeCard analysis={analysis6 as unknown as Analysis} />
              </div>
            </div>
            <SurfaceGallery
              dimensions={{ length_mm: 2400, width_mm: 150, thickness_mm: 25 }}
              surfaceImages={diagImages}
              analysis={analysis6}
              selectedKnot={selected6}
              onSelectKnot={setSelected6}
            />
            {analysis6.detailed_analysis && (
              <DetailedAnalysisPanel
                headline={analysis6.reasoning}
                detail={analysis6.detailed_analysis}
              />
            )}
            <div className="flex gap-3 flex-wrap">
              <button
                type="button"
                onClick={handleReset6}
                className="flex items-center gap-2 px-5 py-3 rounded-xl border border-neutral-700 text-neutral-300 font-semibold hover:border-neutral-500 active:scale-[0.98] transition-all min-h-[44px]"
              >
                <RotateCcw size={16} />
                Try Another Type
              </button>
            </div>
          </div>
        )}

        {/* ── 2-FACE RESULTS ── */}
        {state2 === "results" && analysis2 && frontImage && backImage && (
          <div className="flex flex-col gap-6 sm:gap-8">
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-start">
              <div className="flex-1">
                <h2 className="text-xl sm:text-2xl font-bold mb-1">Analysis Complete</h2>
                <p className="text-neutral-500 text-sm">Board ID: <span className="font-mono text-neutral-400">{boardIdRef.current}</span></p>
              </div>
              <div className="w-full sm:w-72">
                <GradeCard analysis={analysis2} />
              </div>
            </div>
            <div className="flex flex-col xl:flex-row gap-4 xl:gap-6 items-start">
              <div className="flex-1 min-w-0">
                <PairOverlay
                  frontImage={frontImage} frontMime={frontMime}
                  backImage={backImage} backMime={backMime}
                  analysis={analysis2}
                  pairLines={analysis2.pairs.map(([frontId, backId, confidence]) => ({ frontId, backId, confidence }))}
                  hoveredKnot={hoveredKnot} selectedKnot={selectedKnot}
                  onKnotHover={(face, id) => setHoveredKnot(id != null ? { face, id } : null)}
                  onKnotClick={(face, id) => { setSelectedKnot((p) => p?.face === face && p.id === id ? null : { face, id }); setDetailOpen(true); }}
                />
              </div>
              <div className={`w-full xl:w-80 xl:flex-shrink-0 ${detailOpen ? "block" : "hidden xl:block"}`}>
                <KnotDetailPanel
                  analysis={analysis2}
                  selectedFace={selectedKnot?.face ?? null}
                  selectedId={selectedKnot?.id ?? null}
                  onSelectKnot={(face, id) => { setSelectedKnot({ face, id }); setDetailOpen(true); }}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => setDetailOpen((o) => !o)}
              className="xl:hidden flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-neutral-800 text-neutral-400 text-sm hover:border-neutral-600 transition-colors"
            >
              <PanelRight size={15} />
              {detailOpen ? "Hide" : "View"} Knot Details
            </button>
            <div className="flex gap-3 flex-wrap">
              <button
                type="button" onClick={handleDownloadPdf} disabled={downloadingPdf}
                className="flex items-center gap-2 px-5 sm:px-6 py-3 rounded-xl bg-amber-500 text-neutral-950 font-semibold hover:bg-amber-400 active:scale-[0.98] transition-all disabled:opacity-50 min-h-[44px]"
              >
                <Download size={16} />
                {downloadingPdf ? "Generating…" : "Download Report"}
              </button>
              <button
                type="button" onClick={handleExportJson}
                className="flex items-center gap-2 px-5 sm:px-6 py-3 rounded-xl border border-neutral-700 text-neutral-300 font-semibold hover:border-amber-500/50 active:scale-[0.98] transition-all min-h-[44px]"
              >
                <FileJson size={16} />
                Export JSON
              </button>
              <button
                type="button" onClick={handleReset2}
                className="flex items-center gap-2 px-5 sm:px-6 py-3 rounded-xl border border-neutral-700 text-neutral-300 font-semibold hover:border-neutral-500 active:scale-[0.98] transition-all min-h-[44px]"
              >
                <RotateCcw size={16} />
                Analyse Another Board
              </button>
            </div>
          </div>
        )}

        {/* ── DIAGRAM GUIDE (hidden while loading or showing results) ── */}
        {state6 === "empty" && state2 === "empty" && (
          <>
            {/* Section heading */}
            <div className="flex flex-col gap-1">
              <h2 className="text-xl font-bold text-neutral-100">
                What kind of knot do you have?
              </h2>
              <p className="text-sm text-neutral-500">
                Click a shape below to see rendered example images and run an AI grading analysis.
              </p>
            </div>

            <KnotTypeDiagram
              onAnalyze={handleDiagramAnalyze}
              analyzing={isLoading}
              analyzingPresetId={analyzingPresetId}
            />

            {/* ── Divider ── */}
            <div className="flex items-center gap-4">
              <div className="flex-1 h-px bg-neutral-800" />
              <span className="text-xs text-neutral-600 uppercase tracking-widest font-medium">
                or upload your own photos
              </span>
              <div className="flex-1 h-px bg-neutral-800" />
            </div>

            {/* ── Upload section ── */}
            <div className="flex flex-col gap-6">
              {/* Mode toggle */}
              <div className="flex justify-center">
                <div className="flex rounded-xl border border-neutral-800 overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setUploadMode("2face")}
                    className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-colors ${uploadMode === "2face" ? "bg-amber-500 text-neutral-950" : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"}`}
                  >
                    <Layers size={15} />
                    2 Faces
                  </button>
                  <button
                    type="button"
                    onClick={() => setUploadMode("6face")}
                    className={`flex items-center gap-2 px-5 py-2.5 text-sm font-medium transition-colors ${uploadMode === "6face" ? "bg-amber-500 text-neutral-950" : "text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800"}`}
                  >
                    <Boxes size={15} />
                    6 Faces
                  </button>
                </div>
              </div>

              {/* 2-face upload */}
              {uploadMode === "2face" && (
                <div className="flex flex-col items-center gap-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-2xl">
                    <DropZone label="Front Face" value={frontImage} onChange={setFrontImage} />
                    <DropZone label="Back Face" value={backImage} onChange={setBackImage} />
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <button
                      id="analyze-btn"
                      type="button"
                      onClick={handleAnalyze2}
                      disabled={!canAnalyze2}
                      className="flex items-center gap-2 px-8 py-4 rounded-xl bg-amber-500 text-neutral-950 font-bold text-base hover:bg-amber-400 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed min-h-[56px]"
                    >
                      <Zap size={18} />
                      Analyse Board
                    </button>
                    {canAnalyze2 && <p className="text-xs text-neutral-600">or press Enter</p>}
                  </div>
                </div>
              )}

              {/* 6-face upload */}
              {uploadMode === "6face" && (
                <div className="flex flex-col items-center gap-5">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 w-full max-w-2xl">
                    {SURFACE_IDS.map((sid) => (
                      <DropZone
                        key={sid}
                        label={sid.charAt(0).toUpperCase() + sid.slice(1) + " Face"}
                        value={images6Upload[sid] ?? null}
                        onChange={(v) => setImages6Upload((p) => ({ ...p, [sid]: v ?? undefined }))}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={handleAnalyze6Upload}
                    disabled={!canAnalyze6Upload}
                    className="flex items-center gap-2 px-8 py-4 rounded-xl bg-amber-500 text-neutral-950 font-bold text-base hover:bg-amber-400 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed min-h-[56px]"
                  >
                    <Zap size={18} />
                    Analyse 6 Faces
                  </button>
                </div>
              )}

              {/* Editor CTA */}
              <div className="flex justify-center">
                <Link
                  href="/editor"
                  className="flex items-center gap-2.5 px-5 py-3 rounded-xl border border-amber-500/30 bg-amber-500/5 text-amber-300 hover:bg-amber-500/10 hover:border-amber-500/50 transition-colors text-sm"
                >
                  <Upload size={15} />
                  <span>Or design a plank in the <strong className="font-bold text-amber-200">6-Surface Editor</strong> &rarr;</span>
                </Link>
              </div>
            </div>
          </>
        )}
      </main>

      <HistoryPanel
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        onRestore={handleRestore}
        refreshToken={historyToken}
      />
    </div>
  );
}
