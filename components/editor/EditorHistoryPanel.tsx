"use client";

import { useCallback, useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Clock, Download, Trash2, FileDown, Boxes } from "lucide-react";
import {
  load6FaceHistory,
  delete6FaceRecord,
  clear6FaceHistory,
  export6FaceRecordJson,
  exportAll6FaceJson,
  type SixFaceRecord,
} from "@/lib/history";
import { gradeTailwind } from "@/lib/grading";

interface EditorHistoryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onRestore: (record: SixFaceRecord) => void;
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

export function EditorHistoryPanel({
  open, onOpenChange, onRestore, refreshToken,
}: EditorHistoryPanelProps) {
  const [records, setRecords] = useState<SixFaceRecord[]>([]);

  const refresh = useCallback(() => setRecords(load6FaceHistory()), []);

  useEffect(() => {
    if (open) refresh();
  }, [open, refresh, refreshToken]);

  const handleDelete = (id: string) => { delete6FaceRecord(id); refresh(); };
  const handleClear = () => { clear6FaceHistory(); refresh(); };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:w-[460px] bg-neutral-950 border-neutral-800 flex flex-col p-0">
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-neutral-800">
          <SheetTitle className="text-neutral-100 flex items-center gap-2">
            <Boxes size={16} className="text-amber-500" />
            6-Surface History
          </SheetTitle>
          <p className="text-xs text-neutral-600">
            {records.length} plank{records.length !== 1 ? "s" : ""} · up to 15 stored locally
          </p>
        </SheetHeader>

        {records.length > 0 && (
          <div className="flex gap-2 px-5 py-3 border-b border-neutral-800">
            <button
              type="button"
              onClick={() => exportAll6FaceJson(records)}
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

        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-3">
          {records.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-center py-16">
              <Clock size={32} className="text-neutral-700" />
              <p className="text-neutral-500 text-sm">No 6-surface analyses yet.</p>
              <p className="text-neutral-700 text-xs">Analyses are saved here automatically.</p>
            </div>
          ) : (
            records.map((record) => (
              <Record6Card
                key={record.id}
                record={record}
                onRestore={() => { onRestore(record); onOpenChange(false); }}
                onExport={() => export6FaceRecordJson(record)}
                onDelete={() => handleDelete(record.id)}
              />
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

interface Record6CardProps {
  record: SixFaceRecord;
  onRestore: () => void;
  onExport: () => void;
  onDelete: () => void;
}

function Record6Card({ record, onRestore, onExport, onDelete }: Record6CardProps) {
  const { analysis, dimensions, thumbs } = record;
  const gradeStyle = gradeTailwind(analysis.estimated_grade);
  // Pick the two faces with the most knots as the thumbnail mosaic
  return (
    <div className="border border-neutral-800 bg-neutral-900 overflow-hidden">
      <button
        type="button"
        onClick={onRestore}
        className="w-full flex gap-3 p-3 hover:bg-neutral-800/60 transition-colors text-left"
        title="Restore this plank"
      >
        {/* Mini 3-thumbnail strip: front, back, top */}
        <div className="flex flex-col gap-1 flex-shrink-0">
          <div className="flex gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`data:image/jpeg;base64,${thumbs.front}`} alt="front" className="w-16 h-5 object-cover bg-neutral-800" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`data:image/jpeg;base64,${thumbs.back}`} alt="back" className="w-16 h-5 object-cover bg-neutral-800" />
          </div>
          <div className="flex gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`data:image/jpeg;base64,${thumbs.top}`} alt="top" className="w-16 h-3 object-cover bg-neutral-800" />
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`data:image/jpeg;base64,${thumbs.bottom}`} alt="bottom" className="w-16 h-3 object-cover bg-neutral-800" />
          </div>
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
            {analysis.total_knots} knot{analysis.total_knots !== 1 ? "s" : ""} · {analysis.through_knot_count} through · 6 surfaces
          </p>
          <p className="text-[10px] text-neutral-600 font-mono">
            {dimensions.length_mm} × {dimensions.width_mm} × {dimensions.thickness_mm} mm
          </p>
          <p className="text-xs text-neutral-600">{formatTime(record.timestamp)}</p>
        </div>
      </button>

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
