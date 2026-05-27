"use client";

import { useEffect, useRef, useState } from "react";
import { ImageIcon } from "lucide-react";

interface SampleBoard {
  id: string;
  species: string;
  front: string;
  back: string;
}

interface SampleBoardsProps {
  onSelect: (front: string, back: string) => void;
}

export function SampleBoards({ onSelect }: SampleBoardsProps) {
  const [boards, setBoards] = useState<SampleBoard[]>([]);
  const [loading, setLoading] = useState(true);
  const analyzeRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    fetch("/samples/manifest.json")
      .then((r) => r.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) setBoards(data as SampleBoard[]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleSelect = async (board: SampleBoard) => {
    try {
      const [frontRes, backRes] = await Promise.all([
        fetch(board.front),
        fetch(board.back),
      ]);
      const [frontBlob, backBlob] = await Promise.all([
        frontRes.blob(),
        backRes.blob(),
      ]);

      const toBase64 = (blob: Blob): Promise<string> =>
        new Promise((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => {
            const result = e.target?.result as string;
            resolve(result.split(",")[1]);
          };
          reader.readAsDataURL(blob);
        });

      const [frontB64, backB64] = await Promise.all([
        toBase64(frontBlob),
        toBase64(backBlob),
      ]);

      onSelect(frontB64, backB64);

      // Scroll to the analyze button
      const btn = document.getElementById("analyze-btn");
      btn?.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch {
      // silently fail — sample images may not exist yet
    }
  };

  if (loading) return null;
  if (boards.length === 0) return null;

  return (
    <div className="flex flex-col gap-3 w-full">
      <p className="text-xs font-medium uppercase tracking-widest text-neutral-600 text-center">
        Or try a sample board
      </p>
      <div className="flex gap-3 justify-center flex-wrap">
        {boards.map((board) => (
          <button
            key={board.id}
            type="button"
            onClick={() => handleSelect(board)}
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
      <p ref={(el) => { analyzeRef.current = el; }} />
    </div>
  );
}
