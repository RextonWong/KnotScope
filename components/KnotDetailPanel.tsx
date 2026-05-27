"use client";

import type { Analysis, Knot } from "@/lib/schema";
import { knotTypeBadge } from "@/lib/grading";
import { ChevronRight } from "lucide-react";

interface KnotDetailPanelProps {
  analysis: Analysis;
  selectedFace: "front" | "back" | null;
  selectedId: number | null;
  onSelectKnot: (face: "front" | "back", id: number) => void;
}

export function KnotDetailPanel({
  analysis,
  selectedFace,
  selectedId,
  onSelectKnot,
}: KnotDetailPanelProps) {
  const selectedKnot: Knot | undefined =
    selectedFace != null && selectedId != null
      ? analysis[selectedFace].find((k) => k.id === selectedId)
      : undefined;

  const pairedKnot = (() => {
    if (!selectedKnot || selectedFace == null) return null;
    const oppFace = selectedFace === "front" ? "back" : "front";
    if (selectedFace === "front") {
      const pair = analysis.pairs.find(([f]) => f === selectedKnot.id);
      if (!pair) return null;
      const knot = analysis[oppFace].find((k) => k.id === pair[1]);
      return knot ? { knot, face: oppFace, confidence: pair[2] } : null;
    } else {
      const pair = analysis.pairs.find(([, b]) => b === selectedKnot.id);
      if (!pair) return null;
      const knot = analysis[oppFace].find((k) => k.id === pair[0]);
      return knot ? { knot, face: oppFace, confidence: pair[2] } : null;
    }
  })();

  if (selectedKnot && selectedFace) {
    const badge = knotTypeBadge(selectedKnot.type);
    return (
      <aside className="w-full flex flex-col gap-4 bg-neutral-900 rounded-2xl border border-neutral-800 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-neutral-300">Knot Details</h3>
          <span className="text-xs text-neutral-600 capitalize">{selectedFace} face</span>
        </div>

        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <span className="text-neutral-500 text-sm">ID</span>
            <span className="font-mono font-bold text-neutral-200">#{selectedKnot.id}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-500 text-sm">Type</span>
            <span className={`text-xs px-2 py-0.5 rounded border font-medium ${badge.className}`}>
              {badge.label}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-neutral-500 text-sm">Diameter</span>
            <span className="font-semibold tabular-nums text-neutral-200">
              {selectedKnot.diameter_estimate_mm} mm
            </span>
          </div>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <span className="text-neutral-500 text-sm">Confidence</span>
              <span className="font-semibold tabular-nums text-neutral-200">
                {Math.round(selectedKnot.confidence * 100)}%
              </span>
            </div>
            <div className="w-full bg-neutral-800 rounded-full h-1.5">
              <div
                className="bg-amber-500 h-1.5 rounded-full transition-all"
                style={{ width: `${selectedKnot.confidence * 100}%` }}
              />
            </div>
          </div>

          {pairedKnot ? (
            <div className="mt-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs text-amber-400 font-medium">
                Paired with #{pairedKnot.knot.id} on {pairedKnot.face} face
              </p>
              <p className="text-xs text-neutral-500 mt-1">
                Pair confidence: {Math.round(pairedKnot.confidence * 100)}%
              </p>
            </div>
          ) : (
            <div className="mt-2 p-3 rounded-lg bg-neutral-800 border border-neutral-700">
              <p className="text-xs text-neutral-500">No matching knot on opposite face</p>
            </div>
          )}
        </div>
      </aside>
    );
  }

  // Summary list
  return (
    <aside className="w-full flex flex-col gap-3 bg-neutral-900 rounded-2xl border border-neutral-800 p-5">
      <h3 className="text-sm font-semibold text-neutral-300">All Knots</h3>
      <p className="text-xs text-neutral-600">Click a knot on the canvas to inspect it.</p>

      {(["front", "back"] as const).map((face) => (
        <div key={face} className="flex flex-col gap-1">
          <span className="text-xs font-medium uppercase tracking-widest text-neutral-600 mt-2">
            {face} face
          </span>
          {analysis[face].length === 0 ? (
            <p className="text-xs text-neutral-700 pl-2">No knots detected</p>
          ) : (
            analysis[face].map((knot) => {
              const badge = knotTypeBadge(knot.type);
              return (
                <button
                  key={knot.id}
                  type="button"
                  onClick={() => onSelectKnot(face, knot.id)}
                  className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-neutral-800 transition-colors text-left min-h-[44px]"
                >
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-neutral-500">#{knot.id}</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded border ${badge.className}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-neutral-500 tabular-nums">
                      {knot.diameter_estimate_mm}mm
                    </span>
                    <ChevronRight size={12} className="text-neutral-700" />
                  </div>
                </button>
              );
            })
          )}
        </div>
      ))}
    </aside>
  );
}
