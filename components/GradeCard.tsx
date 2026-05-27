"use client";

import type { Analysis } from "@/lib/schema";
import { gradeTailwind } from "@/lib/grading";
import { Ruler, Layers, ArrowLeftRight } from "lucide-react";

interface GradeCardProps {
  analysis: Analysis;
}

export function GradeCard({ analysis }: GradeCardProps) {
  const colors = gradeTailwind(analysis.estimated_grade);

  return (
    <div className={`rounded-2xl border p-6 flex flex-col gap-5 ${colors.bg} ${colors.border}`}>
      <div className="flex flex-col gap-1">
        <span className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
          Structural Grade
        </span>
        <span className={`text-7xl font-black tabular-nums leading-none ${colors.text}`}>
          {analysis.estimated_grade}
        </span>
      </div>

      <div className="flex flex-col gap-3">
        <StatRow
          icon={<Layers size={15} />}
          label="Total Knots"
          value={String(analysis.total_knots)}
        />
        <StatRow
          icon={<ArrowLeftRight size={15} />}
          label="Through Knots"
          value={String(analysis.through_knot_count)}
        />
        <StatRow
          icon={<Ruler size={15} />}
          label="Max Diameter"
          value={`${analysis.max_knot_diameter_mm} mm`}
        />
      </div>

      <p className="text-sm italic text-neutral-400 border-t border-neutral-800 pt-4 leading-relaxed">
        {analysis.reasoning}
      </p>
    </div>
  );
}

function StatRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2 text-neutral-500">
        {icon}
        <span>{label}</span>
      </div>
      <span className="font-semibold tabular-nums text-neutral-200">{value}</span>
    </div>
  );
}
