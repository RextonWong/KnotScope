"use client";

import type { PlankDimensions } from "@/lib/plank";
import { DIMENSION_LIMITS } from "@/lib/plank";
import { Ruler } from "lucide-react";

interface PlankSizePanelProps {
  dimensions: PlankDimensions;
  onChange: (next: PlankDimensions) => void;
}

export function PlankSizePanel({ dimensions, onChange }: PlankSizePanelProps) {
  const set = (key: keyof PlankDimensions) => (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange({ ...dimensions, [key]: Number(e.target.value) });
  };

  return (
    <aside className="w-full bg-neutral-900 rounded-2xl border border-neutral-800 p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2">
        <Ruler size={14} className="text-amber-500" />
        <h3 className="text-sm font-semibold text-neutral-300">Plank Dimensions</h3>
      </div>

      <Slider
        label="Length"
        value={dimensions.length_mm}
        unit="mm"
        {...DIMENSION_LIMITS.length_mm}
        onChange={set("length_mm")}
      />
      <Slider
        label="Width"
        value={dimensions.width_mm}
        unit="mm"
        {...DIMENSION_LIMITS.width_mm}
        onChange={set("width_mm")}
      />
      <Slider
        label="Thickness"
        value={dimensions.thickness_mm}
        unit="mm"
        {...DIMENSION_LIMITS.thickness_mm}
        onChange={set("thickness_mm")}
      />

      <p className="text-[10px] text-neutral-600 leading-relaxed mt-1">
        Knots stay attached to their surface as you resize. Through-knot pairs
        are computed from the rendered surfaces, not the editor model.
      </p>
    </aside>
  );
}

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

function Slider({ label, value, min, max, step, unit, onChange }: SliderProps) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs uppercase tracking-wider text-neutral-500">{label}</label>
        <span className="text-xs font-mono text-neutral-300 tabular-nums">
          {value} {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={onChange}
        className="w-full accent-amber-500"
      />
    </div>
  );
}
