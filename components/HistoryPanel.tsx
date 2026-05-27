"use client";

import { useCallback, useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Clock, Download, Trash2, FileDown } from "lucide-react";
import {
  loadHistory,
  deleteRecord,
  clearHistory,
  exportRecordJson,
  exportAllJson,
  type HistoryRecord,
} from "@/lib/history";
import { gradeTailwind } from "@/lib/grading";

interface HistoryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestore: (record: HistoryRecord) => void;
  // Increment to force refresh after a new record is saved
  refreshToken?: number;
}

function formatTime(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short", day: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function HistoryPanel({ open, onOpenChange, onRestore, refreshToken }: HistoryPanelProps) {
  const [records, setRecords] = useState<HistoryRecord[]>([]);

  const refresh = useCallback(() => setRecords(loadHistory()), []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh, refreshToken]);

  const handleDelete = (id: string) => {
    deleteRecord(id);
    refresh();
  };

  const handleClear = () => {
    clearHistory();
    refresh();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[420px] bg-neutral-950 border-neutral-800 flex flex-col p-0">
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-neutral-800">
          <SheetTitle className="text-neutral-100 flex items-center gap-2">
            <Clock size={16} className="text-amber-500" />
            Inspection History
          </SheetTitle>
          <p className="text-xs text-neutral-600">
            {records.length} record{records.length !== 1 ? "s" : ""} · up to 20 stored locally
          </p>
        </SheetHeader>

        {/* Top actions */}
        {records.length > 0 && (
          <div className="flex gap-2 px-5 py-3 border-b border-neutral-800">
            <button
              type="button"
              onClick={() => exportAllJson(records)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 text-xs font-medium transition-colors"
            >
              <FileDown size={13} />
              Export All JSON
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-red-900/50 text-neutral-400 hover:text-red-400 text-xs font-medium transition-colors ml-auto"
            >
              <Trash2 size={13} />
              Clear All
            </button>
          </div>
        )}

        {/* Record list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {records.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
              <Clock size={32} className="text-neutral-700" />
              <p className="text-neutral-500 text-sm">No inspections yet.</p>
              <p className="text-neutral-700 text-xs">Analyses are saved here automatically.</p>
            </div>
          ) : (
            records.map((record) => (
              <RecordCard
                key={record.id}
                record={record}
                onRestore={() => { onRestore(record); onOpenChange(false); }}
                onExport={() => exportRecordJson(record)}
                onDelete={() => handleDelete(record.id)}
              />
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface RecordCardProps {
  record: HistoryRecord;
  onRestore: () => void;
  onExport: () => void;
  onDelete: () => void;
}

function RecordCard({ record, onRestore, onExport, onDelete }: RecordCardProps) {
  const { analysis } = record;
  const gradeStyle = gradeTailwind(analysis.estimated_grade);

  return (
    <div className="rounded-xl border border-neutral-800 bg-neutral-900 overflow-hidden">
      {/* Thumbnails + grade */}
      <button
        type="button"
        onClick={onRestore}
        className="w-full flex gap-3 p-3 hover:bg-neutral-800/60 transition-colors text-left"
        title="Restore this inspection"
      >
        <div className="flex gap-1.5 flex-shrink-0">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:${record.frontMime};base64,${record.frontThumb}`}
            alt="front"
            className="w-16 h-12 object-cover rounded-lg bg-neutral-800"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`data:${record.backMime};base64,${record.backThumb}`}
            alt="back"
            className="w-16 h-12 object-cover rounded-lg bg-neutral-800"
          />
        </div>
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={`text-lg font-black leading-none ${gradeStyle.text}`}>
              {analysis.estimated_grade}
            </span>
            <span className="text-xs text-neutral-500 truncate font-mono">
              {record.boardId}
            </span>
          </div>
          <p className="text-xs text-neutral-400">
            {analysis.total_knots} knot{analysis.total_knots !== 1 ? "s" : ""} · {analysis.through_knot_count} through
          </p>
          <p className="text-xs text-neutral-600">{formatTime(record.timestamp)}</p>
        </div>
      </button>

      {/* Card actions */}
      <div className="flex border-t border-neutral-800">
        <button
          type="button"
          onClick={onExport}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/50 transition-colors"
        >
          <Download size={12} />
          JSON
        </button>
        <div className="w-px bg-neutral-800" />
        <button
          type="button"
          onClick={onDelete}
          className="flex-1 flex items-center justify-center gap-1.5 py-2 text-xs text-neutral-500 hover:text-red-400 hover:bg-red-950/30 transition-colors"
        >
          <Trash2 size={12} />
          Delete
        </button>
      </div>
    </div>
  );
}
