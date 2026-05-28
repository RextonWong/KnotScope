"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ImageIcon, Boxes } from "lucide-react";

// ── Manifest types (union of old 2-face and new 6-face format) ───────────────

interface Sample2Face {
  id: string;
  kind?: "2face";
  species: string;
  front: string;
  back: string;
}

interface Sample6Face {
  id: string;
  kind: "6face";
  label: string;
  description?: string;
  surfaces: {
    front: string;
    back: string;
    top: string;
    bottom: string;
    left: string;
    right: string;
  };
}

type SampleEntry = Sample2Face | Sample6Face;

function is6Face(s: SampleEntry): s is Sample6Face {
  return s.kind === "6face";
}

interface SampleBoardsProps {
  onSelect2Face?: (front: string, back: string) => void;
}

export function SampleBoards({ onSelect2Face }: SampleBoardsProps) {
  const [boards, setBoards] = useState<SampleEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/samples/manifest.json")
      .then((r) => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) setBoards(data as SampleEntry[]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return null;
  if (boards.length === 0) return null;

  const samples2 = boards.filter((b) => !is6Face(b)) as Sample2Face[];
  const samples6 = boards.filter(is6Face);

  const handleSelect2Face = async (board: Sample2Face) => {
    if (!onSelect2Face) return;
    try {
      const [frontRes, backRes] = await Promise.all([
        fetch(board.front),
        fetch(board.back),
      ]);
      const [frontBlob, backBlob] = await Promise.all([
        frontRes.blob(), backRes.blob(),
      ]);
      const toBase64 = (blob: Blob): Promise<string> =>
        new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve((e.target?.result as string).split(",")[1]);
          reader.readAsDataURL(blob);
        });
      const [frontB64, backB64] = await Promise.all([
        toBase64(frontBlob), toBase64(backBlob),
      ]);
      onSelect2Face(frontB64, backB64);
      document.getElementById("analyze-btn")?.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch { /* silently fail */ }
  };

  return (
    <div className="flex flex-col gap-5 w-full">
      {/* 2-face samples (legacy wood-species boards) */}
      {samples2.length > 0 && onSelect2Face && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-600 text-center">
            Or try a sample board
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            {samples2.map((board) => (
              <button
                key={board.id}
                type="button"
                onClick={() => handleSelect2Face(board)}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-neutral-800 hover:border-amber-500/50 hover:bg-amber-500/5 transition-colors min-w-[80px] min-h-[44px]"
              >
                <div className="w-12 h-12 rounded-lg bg-neutral-800 flex items-center justify-center overflow-hidden">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={board.front}
                    alt={board.id}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                      e.currentTarget.nextElementSibling?.classList.remove("hidden");
                    }}
                  />
                  <ImageIcon size={20} className="text-neutral-600 hidden" />
                </div>
                <span className="text-xs text-neutral-500">{board.species}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 6-face knot-type samples */}
      {samples6.length > 0 && (
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium uppercase tracking-widest text-neutral-600 text-center">
            6-face knot-type samples
          </p>
          <div className="flex gap-3 justify-center flex-wrap">
            {samples6.map((board) => (
              <Link
                key={board.id}
                href={`/editor?preset=${board.id}`}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl border border-neutral-800 hover:border-amber-500/50 hover:bg-amber-500/5 transition-colors min-w-[100px]"
              >
                <div className="w-14 h-8 rounded-lg bg-neutral-800 flex items-center justify-center overflow-hidden relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={board.surfaces.front}
                    alt={board.label}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                      e.currentTarget.nextElementSibling?.classList.remove("hidden");
                    }}
                  />
                  <ImageIcon size={16} className="text-neutral-600 hidden" />
                  <div className="absolute bottom-0.5 right-0.5">
                    <Boxes size={9} className="text-amber-400" />
                  </div>
                </div>
                <span className="text-xs text-neutral-400 font-medium text-center leading-tight">{board.label}</span>
                <span className="text-[10px] text-amber-500 flex items-center gap-0.5">
                  <Boxes size={9} />
                  Open in Editor
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
