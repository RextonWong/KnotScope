import type { Analysis } from "@/lib/schema";

export interface HistoryRecord {
  id: string;
  boardId: string;
  timestamp: string;
  analysis: Analysis;
  frontThumb: string; // base64, no data: prefix
  backThumb: string;
  frontMime: string;
  backMime: string;
}

const STORAGE_KEY = "knotscope_history";
const MAX_RECORDS = 20;

export function loadHistory(): HistoryRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryRecord[];
  } catch {
    return [];
  }
}

export function saveRecord(record: HistoryRecord): void {
  const history = loadHistory();
  const updated = [record, ...history.filter((r) => r.id !== record.id)].slice(0, MAX_RECORDS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {
    // Quota exceeded — trim aggressively and retry once
    const trimmed = updated.slice(0, 10);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
    } catch {
      // Storage unavailable, silently skip
    }
  }
}

export function deleteRecord(id: string): void {
  const history = loadHistory().filter((r) => r.id !== id);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch { /* ignore */ }
}

export function clearHistory(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch { /* ignore */ }
}

// Generate a ~240px wide JPEG thumbnail from a full base64 image
export async function generateThumbnail(
  base64: string,
  mime: string,
  targetWidth = 240
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = targetWidth / img.naturalWidth;
      const w = targetWidth;
      const h = Math.round(img.naturalHeight * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(base64); return; }
      ctx.drawImage(img, 0, 0, w, h);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
      // Strip "data:image/jpeg;base64," prefix
      const b64 = dataUrl.split(",")[1] ?? base64;
      resolve(b64);
    };
    img.onerror = () => resolve(base64);
    img.src = `data:${mime};base64,${base64}`;
  });
}

// ─── JSON export helpers ──────────────────────────────────────────────────────

function buildExportJson(record: HistoryRecord): object {
  const { analysis, boardId, timestamp } = record;
  return {
    knotscope_version: "1.0",
    exported_at: new Date().toISOString(),
    board_id: boardId,
    analyzed_at: timestamp,
    summary: {
      estimated_grade: analysis.estimated_grade,
      total_knots: analysis.total_knots,
      through_knot_count: analysis.through_knot_count,
      max_knot_diameter_mm: analysis.max_knot_diameter_mm,
      reasoning: analysis.reasoning,
    },
    front_face: analysis.front,
    back_face: analysis.back,
    through_knot_pairs: analysis.pairs.map(([front_id, back_id, confidence]) => ({
      front_id,
      back_id,
      confidence,
    })),
  };
}

function triggerDownload(filename: string, json: object): void {
  const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportRecordJson(record: HistoryRecord): void {
  triggerDownload(`knotscope-${record.boardId}.json`, buildExportJson(record));
}

export function exportAllJson(records: HistoryRecord[]): void {
  const payload = {
    knotscope_version: "1.0",
    exported_at: new Date().toISOString(),
    record_count: records.length,
    records: records.map(buildExportJson),
  };
  triggerDownload(`knotscope-history-${Date.now()}.json`, payload);
}
