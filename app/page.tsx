"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { toast } from "sonner";
import { DropZone } from "@/components/DropZone";
import { AnalysisCanvas } from "@/components/AnalysisCanvas";
import { GradeCard } from "@/components/GradeCard";
import { KnotDetailPanel } from "@/components/KnotDetailPanel";
import { LoadingState } from "@/components/LoadingState";
import { SampleBoards } from "@/components/SampleBoards";
import { bboxCenter } from "@/lib/bbox";
import { TreePine, Zap, RotateCcw, Download, PanelRight, History, FileJson } from "lucide-react";
import type { Analysis } from "@/lib/schema";
import { HistoryPanel } from "@/components/HistoryPanel";
import { generateThumbnail, saveRecord, exportRecordJson, type HistoryRecord } from "@/lib/history";

type AppState = "empty" | "loading" | "results";

// Base64 string → bytes → detect MIME from magic bytes
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

// Approximate base64 payload → bytes
function b64Bytes(b64: string) {
  return Math.ceil((b64.length * 3) / 4);
}

// ─── Pair SVG Overlay ────────────────────────────────────────────────────────

interface PairLine { frontId: number; backId: number; confidence: number }

interface PairOverlayProps {
  frontImage: string;
  frontMime: string;
  backImage: string;
  backMime: string;
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
  // Track when each image has loaded before measuring
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

  // Update rects when either image loads (wait for both)
  const handleFrontLoad = useCallback(() => {
    loadedRef.current.front = true;
    if (loadedRef.current.back) measureRects();
  }, [measureRects]);

  const handleBackLoad = useCallback(() => {
    loadedRef.current.back = true;
    if (loadedRef.current.front) measureRects();
  }, [measureRects]);

  // Also re-measure on resize
  useEffect(() => {
    window.addEventListener("resize", measureRects);
    return () => window.removeEventListener("resize", measureRects);
  }, [measureRects]);

  // Reset loaded flags when images change
  useEffect(() => {
    loadedRef.current = { front: false, back: false };
  }, [frontImage, backImage]);

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
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none z-10"
        style={{ overflow: "visible" }}
      >
        {svgLines.map((l, i) => (
          <line key={i} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2}
            stroke={l.stroke} strokeWidth={l.strokeWidth} opacity={l.opacity}
            strokeDasharray="5 3" strokeLinecap="round"
          />
        ))}
      </svg>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div data-face="front">
          <AnalysisCanvas
            image={frontImage} mimeType={frontMime}
            knots={analysis.front} face="front"
            hoveredId={hoveredKnot?.face === "front" ? hoveredKnot.id : null}
            selectedId={selectedKnot?.face === "front" ? selectedKnot.id : null}
            onKnotHover={(id) => onKnotHover("front", id)}
            onKnotClick={(id) => onKnotClick("front", id)}
            onImageLoad={handleFrontLoad}
          />
        </div>
        <div data-face="back">
          <AnalysisCanvas
            image={backImage} mimeType={backMime}
            knots={analysis.back} face="back"
            hoveredId={hoveredKnot?.face === "back" ? hoveredKnot.id : null}
            selectedId={selectedKnot?.face === "back" ? selectedKnot.id : null}
            onKnotHover={(id) => onKnotHover("back", id)}
            onKnotClick={(id) => onKnotClick("back", id)}
            onImageLoad={handleBackLoad}
          />
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Home() {
  const [state, setState] = useState<AppState>("empty");
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [hoveredKnot, setHoveredKnot] = useState<{ face: "front" | "back"; id: number } | null>(null);
  const [selectedKnot, setSelectedKnot] = useState<{ face: "front" | "back"; id: number } | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyToken, setHistoryToken] = useState(0);
  const boardIdRef = useRef(`board-${Date.now()}`);
  const currentRecordRef = useRef<HistoryRecord | null>(null);

  const canAnalyze = frontImage !== null && backImage !== null;
  const frontMime = frontImage ? detectMime(frontImage) : "image/jpeg";
  const backMime = backImage ? detectMime(backImage) : "image/jpeg";

  const handleAnalyze = async () => {
    if (!frontImage || !backImage) return;

    // Warn if images are very large (>3 MB each)
    const frontMB = b64Bytes(frontImage) / 1_048_576;
    const backMB = b64Bytes(backImage) / 1_048_576;
    if (frontMB > 3 || backMB > 3) {
      toast.warning(
        `Large images detected (${frontMB.toFixed(1)} MB / ${backMB.toFixed(1)} MB). ` +
        "Analysis may be slow — consider using smaller photos.",
        { duration: 6000 }
      );
    }

    setState("loading");
    setSelectedKnot(null);
    setHoveredKnot(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frontImage, backImage }),
      });
      const data = await res.json() as unknown;
      if (!res.ok) {
        const err = data as { error?: string };
        throw new Error(err.error ?? "Analysis failed");
      }
      const result = data as Analysis;
      setAnalysis(result);
      setState("results");
      boardIdRef.current = `board-${Date.now()}`;

      // Save to history (thumbnails generated async, non-blocking)
      const fMime = detectMime(frontImage);
      const bMime = detectMime(backImage);
      Promise.all([
        generateThumbnail(frontImage, fMime),
        generateThumbnail(backImage, bMime),
      ]).then(([frontThumb, backThumb]) => {
        const record: HistoryRecord = {
          id: boardIdRef.current,
          boardId: boardIdRef.current,
          timestamp: new Date().toISOString(),
          analysis: result,
          frontThumb,
          backThumb,
          frontMime: fMime,
          backMime: bMime,
        };
        currentRecordRef.current = record;
        saveRecord(record);
        setHistoryToken((t) => t + 1);
      });

      // Success feedback
      if (result.total_knots === 0) {
        toast.info("No knots detected — the board appears clear.", { duration: 5000 });
      } else {
        toast.success(
          `Grade ${result.estimated_grade} — ${result.total_knots} knot${result.total_knots !== 1 ? "s" : ""} found, ${result.through_knot_count} through-knot${result.through_knot_count !== 1 ? "s" : ""}.`,
          { duration: 5000 }
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Analysis failed: ${msg}`);
      setState("empty");
    }
  };

  const handleReset = () => {
    setState("empty");
    setFrontImage(null);
    setBackImage(null);
    setAnalysis(null);
    setSelectedKnot(null);
    setHoveredKnot(null);
    setDetailOpen(false);
    currentRecordRef.current = null;
  };

  const handleRestore = (record: HistoryRecord) => {
    setFrontImage(record.frontThumb);
    setBackImage(record.backThumb);
    setAnalysis(record.analysis);
    boardIdRef.current = record.boardId;
    currentRecordRef.current = record;
    setState("results");
    setSelectedKnot(null);
    setHoveredKnot(null);
    setDetailOpen(false);
  };

  const handleExportJson = () => {
    if (currentRecordRef.current) {
      exportRecordJson(currentRecordRef.current);
    }
  };

  const handleDownloadPdf = async () => {
    if (!analysis || !frontImage || !backImage) return;
    setDownloadingPdf(true);
    const toastId = toast.loading("Generating PDF report…");
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ analysis, frontImage, backImage, boardId: boardIdRef.current }),
      });
      if (!res.ok) throw new Error("Failed to generate PDF");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `knotscope-${boardIdRef.current}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Report downloaded.", { id: toastId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "PDF generation failed";
      toast.error(msg, { id: toastId });
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Keyboard shortcut: Enter to analyze
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Enter" && state === "empty" && canAnalyze) handleAnalyze();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, canAnalyze]);

  const handleKnotHover = (face: "front" | "back", id: number | null) =>
    setHoveredKnot(id != null ? { face, id } : null);

  const handleKnotClick = (face: "front" | "back", id: number) => {
    setSelectedKnot((prev) => prev?.face === face && prev.id === id ? null : { face, id });
    setDetailOpen(true);
  };

  const handleSelectKnot = (face: "front" | "back", id: number) => {
    setSelectedKnot({ face, id });
    setDetailOpen(true);
  };

  const pairLines = analysis?.pairs.map(([frontId, backId, confidence]) => ({
    frontId, backId, confidence,
  })) ?? [];

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      {/* Nav */}
      <nav className="border-b border-neutral-800 px-4 sm:px-6 py-4 flex items-center gap-3">
        <TreePine size={20} className="text-amber-500 flex-shrink-0" />
        <span className="font-bold text-lg tracking-tight">KnotScope</span>
        <span className="hidden sm:inline text-xs text-neutral-600 font-medium ml-1">
          Lumber Inspection AI
        </span>
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-neutral-800 text-neutral-400 hover:border-neutral-600 hover:text-neutral-200 text-xs font-medium transition-colors"
        >
          <History size={14} />
          History
        </button>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12">

        {/* ── EMPTY STATE ── */}
        {state === "empty" && (
          <div className="flex flex-col items-center gap-8 sm:gap-10">
            <div className="text-center max-w-lg">
              <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-3">KnotScope</h1>
              <p className="text-neutral-400 leading-relaxed text-sm sm:text-base">
                Upload front and back photos of a wooden board. AI detects knots,
                pairs through-knots, and computes a structural grade in seconds.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6 w-full max-w-2xl">
              <DropZone label="Front Face" value={frontImage} onChange={setFrontImage} />
              <DropZone label="Back Face" value={backImage} onChange={setBackImage} />
            </div>

            <SampleBoards onSelect={(f, b) => { setFrontImage(f); setBackImage(b); }} />

            <div className="flex flex-col items-center gap-2">
              <button
                id="analyze-btn"
                type="button"
                onClick={handleAnalyze}
                disabled={!canAnalyze}
                className="flex items-center gap-2 px-8 py-4 rounded-xl bg-amber-500 text-neutral-950 font-bold text-base
                  hover:bg-amber-400 active:scale-[0.98] transition-all disabled:opacity-30 disabled:cursor-not-allowed min-h-[56px]"
              >
                <Zap size={18} />
                Analyze Board
              </button>
              {canAnalyze && (
                <p className="text-xs text-neutral-600">or press Enter</p>
              )}
            </div>
          </div>
        )}

        {/* ── LOADING STATE ── */}
        {state === "loading" && <LoadingState />}

        {/* ── RESULTS STATE ── */}
        {state === "results" && analysis && frontImage && backImage && (
          <div className="flex flex-col gap-6 sm:gap-8">

            {/* Header row: metadata + grade */}
            <div className="flex flex-col sm:flex-row gap-4 sm:gap-6 items-start">
              <div className="flex-1">
                <h2 className="text-xl sm:text-2xl font-bold mb-1">Analysis Complete</h2>
                <p className="text-neutral-500 text-sm">
                  Board ID:{" "}
                  <span className="font-mono text-neutral-400">{boardIdRef.current}</span>
                </p>
              </div>
              <div className="w-full sm:w-72">
                <GradeCard analysis={analysis} />
              </div>
            </div>

            {/* Canvases + detail panel */}
            <div className="flex flex-col xl:flex-row gap-4 xl:gap-6 items-start">
              <div className="flex-1 min-w-0">
                <PairOverlay
                  frontImage={frontImage} frontMime={frontMime}
                  backImage={backImage} backMime={backMime}
                  analysis={analysis} pairLines={pairLines}
                  hoveredKnot={hoveredKnot} selectedKnot={selectedKnot}
                  onKnotHover={handleKnotHover} onKnotClick={handleKnotClick}
                />
              </div>

              {/* Detail panel — full width below xl, sidebar above xl */}
              <div className={`w-full xl:w-80 xl:flex-shrink-0 ${detailOpen ? "block" : "hidden xl:block"}`}>
                <KnotDetailPanel
                  analysis={analysis}
                  selectedFace={selectedKnot?.face ?? null}
                  selectedId={selectedKnot?.id ?? null}
                  onSelectKnot={handleSelectKnot}
                />
              </div>
            </div>

            {/* Mobile "View Details" toggle */}
            <button
              type="button"
              onClick={() => setDetailOpen((o) => !o)}
              className="xl:hidden flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-neutral-800 text-neutral-400 text-sm hover:border-neutral-600 transition-colors"
            >
              <PanelRight size={15} />
              {detailOpen ? "Hide" : "View"} Knot Details
            </button>

            {/* Action buttons */}
            <div className="flex gap-3 flex-wrap">
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={downloadingPdf}
                className="flex items-center gap-2 px-5 sm:px-6 py-3 rounded-xl bg-amber-500 text-neutral-950 font-semibold
                  hover:bg-amber-400 active:scale-[0.98] transition-all disabled:opacity-50 min-h-[44px]"
              >
                <Download size={16} />
                {downloadingPdf ? "Generating…" : "Download Report"}
              </button>
              <button
                type="button"
                onClick={handleExportJson}
                className="flex items-center gap-2 px-5 sm:px-6 py-3 rounded-xl border border-neutral-700 text-neutral-300 font-semibold
                  hover:border-amber-500/50 hover:text-neutral-100 active:scale-[0.98] transition-all min-h-[44px]"
              >
                <FileJson size={16} />
                Export JSON
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-2 px-5 sm:px-6 py-3 rounded-xl border border-neutral-700 text-neutral-300 font-semibold
                  hover:border-neutral-500 hover:text-neutral-100 active:scale-[0.98] transition-all min-h-[44px]"
              >
                <RotateCcw size={16} />
                Analyze Another Board
              </button>
            </div>
          </div>
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
