"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

const MESSAGES = [
  "Examining front face…",
  "Detecting knots and defects…",
  "Examining back face…",
  "Pairing through-knots…",
  "Computing structural grade…",
];

export function LoadingState() {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (activeIndex >= MESSAGES.length - 1) return;
    const timer = setTimeout(() => setActiveIndex((i) => i + 1), 1500);
    return () => clearTimeout(timer);
  }, [activeIndex]);

  return (
    <div className="flex flex-col items-center justify-center gap-8 py-24">
      <div className="relative">
        <div className="w-16 h-16 rounded-full border-2 border-neutral-800 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
        </div>
        <div className="absolute inset-0 rounded-full bg-amber-500/10 animate-ping" />
      </div>

      <div className="flex flex-col items-center gap-2 w-full max-w-xs">
        {MESSAGES.map((msg, i) => (
          <div
            key={msg}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg w-full transition-all duration-500 ${
              i === activeIndex
                ? "bg-amber-500/10 text-amber-400 scale-100 opacity-100"
                : i < activeIndex
                ? "text-neutral-600 scale-95 opacity-60"
                : "text-neutral-700 scale-95 opacity-40"
            }`}
          >
            <div
              className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                i === activeIndex
                  ? "bg-amber-500 animate-pulse"
                  : i < activeIndex
                  ? "bg-neutral-600"
                  : "bg-neutral-800"
              }`}
            />
            <span className="text-sm font-medium">{msg}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
