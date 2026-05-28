"use client";

import type { DetailedAnalysis } from "@/lib/schema";
import {
  FileText,
  AlertTriangle,
  Link as LinkIcon,
  Scale,
  Wrench,
  Lightbulb,
} from "lucide-react";

interface DetailedAnalysisPanelProps {
  headline: string;
  detail: DetailedAnalysis;
}

export function DetailedAnalysisPanel({ headline, detail }: DetailedAnalysisPanelProps) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900">
      <div className="px-5 py-4 border-b border-neutral-800 flex items-center gap-2">
        <FileText size={14} className="text-amber-500" />
        <h3 className="text-sm font-semibold text-neutral-200">AI Inspection Report</h3>
      </div>

      <div className="px-5 py-4 border-b border-neutral-800">
        <p className="text-xs uppercase tracking-wider text-neutral-500 mb-1">Headline</p>
        <p className="text-base text-amber-100/90 leading-relaxed italic">&ldquo;{headline}&rdquo;</p>
      </div>

      <Section
        icon={<FileText size={14} className="text-neutral-500" />}
        title="Overall condition"
        body={detail.overall}
      />

      <DefectsSection defects={detail.notable_defects} />

      <Section
        icon={<LinkIcon size={14} className="text-neutral-500" />}
        title="Through-knot pattern"
        body={detail.through_knot_discussion}
      />

      <Section
        icon={<Scale size={14} className="text-neutral-500" />}
        title="Grade criteria applied"
        body={detail.grade_criteria_applied}
      />

      <Section
        icon={<Wrench size={14} className="text-neutral-500" />}
        title="Structural assessment"
        body={detail.structural_assessment}
      />

      <Section
        icon={<Lightbulb size={14} className="text-neutral-500" />}
        title="Recommended use"
        body={detail.recommendations}
        last
      />
    </div>
  );
}

interface SectionProps {
  icon: React.ReactNode;
  title: string;
  body: string;
  last?: boolean;
}

function Section({ icon, title, body, last }: SectionProps) {
  return (
    <div className={`px-5 py-4 ${last ? "" : "border-b border-neutral-800"}`}>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <p className="text-xs uppercase tracking-wider text-neutral-500">{title}</p>
      </div>
      <p className="text-sm text-neutral-300 leading-relaxed whitespace-pre-line">{body}</p>
    </div>
  );
}

function DefectsSection({ defects }: { defects: string[] }) {
  return (
    <div className="px-5 py-4 border-b border-neutral-800">
      <div className="flex items-center gap-2 mb-2">
        <AlertTriangle size={14} className="text-neutral-500" />
        <p className="text-xs uppercase tracking-wider text-neutral-500">Notable defects</p>
      </div>
      {defects.length === 0 ? (
        <p className="text-sm text-neutral-500 italic">No specific defects flagged.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {defects.map((d, i) => (
            <li
              key={i}
              className="text-sm text-neutral-300 leading-relaxed pl-3 border-l-2 border-amber-500/40"
            >
              {d}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
