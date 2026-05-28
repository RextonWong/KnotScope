"use client";

import { useEffect, useState } from "react";
import { SAMPLE_PRESETS } from "@/lib/samples";
import { renderAllSurfaces } from "@/lib/renderSurface";
import type { SurfaceId } from "@/lib/plank";
import { SURFACE_IDS } from "@/lib/plank";

type SurfaceImages = Record<SurfaceId, string>;
type AllRendered = Record<string, SurfaceImages>;

const SURFACE_LABELS: Record<SurfaceId, string> = {
  front: "Front", back: "Back", top: "Top",
  bottom: "Bottom", left: "Left", right: "Right",
};

export default function GenerateSamplesPage() {
  const [rendered, setRendered] = useState<AllRendered>({});
  const [status, setStatus] = useState<Record<string, "pending" | "rendering" | "done">>({});
  const [saving, setSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const preset of SAMPLE_PRESETS) {
        if (cancelled) return;
        setStatus((s) => ({ ...s, [preset.id]: "rendering" }));
        const surfaces = await renderAllSurfaces(
          preset.project.dimensions,
          preset.project.knots
        );
        const imgs: SurfaceImages = {} as SurfaceImages;
        for (const sid of SURFACE_IDS) {
          imgs[sid] = surfaces[sid].base64;
        }
        if (!cancelled) {
          setRendered((r) => ({ ...r, [preset.id]: imgs }));
          setStatus((s) => ({ ...s, [preset.id]: "done" }));
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const allDone = SAMPLE_PRESETS.every((p) => status[p.id] === "done");

  const handleSave = async () => {
    if (!allDone) return;
    setSaving(true);
    setSaveResult(null);
    try {
      const files: Record<string, string> = {};
      for (const preset of SAMPLE_PRESETS) {
        const imgs = rendered[preset.id];
        if (!imgs) continue;
        for (const sid of SURFACE_IDS) {
          files[`${preset.id}-${sid}.jpg`] = imgs[sid];
        }
      }

      // Build the new manifest entries
      const manifestEntries = SAMPLE_PRESETS.map((preset) => ({
        id: preset.id,
        label: preset.label,
        kind: "6face",
        description: preset.description,
        surfaces: Object.fromEntries(
          SURFACE_IDS.map((sid) => [sid, `/samples/${preset.id}-${sid}.jpg`])
        ),
      }));

      const res = await fetch("/api/save-samples", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files, manifest: manifestEntries }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Save failed");
      setSaveResult(`Saved ${Object.keys(files).length} images + manifest.json`);
    } catch (e) {
      setSaveResult(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-8">
      <div className="max-w-5xl mx-auto flex flex-col gap-8">
        <div>
          <h1 className="text-2xl font-bold text-amber-400 mb-1">Sample Image Generator</h1>
          <p className="text-sm text-neutral-400">
            Renders the 4 Fig 6 knot-type presets and saves them to{" "}
            <code className="text-amber-300 bg-neutral-800 px-1.5 py-0.5 rounded text-xs">public/samples/</code>.
            Run this page once in dev to update the static assets.
          </p>
        </div>

        {SAMPLE_PRESETS.map((preset) => (
          <div key={preset.id} className="border border-neutral-800 rounded-xl p-5 flex flex-col gap-4">
            <div className="flex items-center gap-3">
              <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                status[preset.id] === "done" ? "bg-emerald-500" :
                status[preset.id] === "rendering" ? "bg-amber-400 animate-pulse" :
                "bg-neutral-700"
              }`} />
              <div>
                <p className="font-semibold text-neutral-100">{preset.label}</p>
                <p className="text-xs text-neutral-500">{preset.description}</p>
              </div>
              <span className="ml-auto text-xs text-neutral-600 font-mono">
                {status[preset.id] ?? "pending"}
              </span>
            </div>

            {rendered[preset.id] && (
              <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                {SURFACE_IDS.map((sid) => (
                  <div key={sid} className="flex flex-col gap-1">
                    <div className="text-[10px] text-neutral-500 text-center uppercase tracking-wider">
                      {SURFACE_LABELS[sid]}
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`data:image/jpeg;base64,${rendered[preset.id]![sid]}`}
                      alt={`${preset.id} ${sid}`}
                      className="w-full border border-neutral-800 bg-neutral-900 object-cover"
                      style={{ aspectRatio: sid === "front" || sid === "back" ? "16" : sid === "top" || sid === "bottom" ? "96/10" : "6/1" }}
                    />
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={!allDone || saving}
            className="px-6 py-3 rounded-xl bg-amber-500 text-neutral-950 font-bold hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? "Saving…" : allDone ? "Save All to /public/samples" : "Rendering…"}
          </button>
          {saveResult && (
            <p className={`text-sm ${saveResult.startsWith("Error") ? "text-red-400" : "text-emerald-400"}`}>
              {saveResult}
            </p>
          )}
        </div>

        <p className="text-xs text-neutral-600">
          After saving, the old wood-species images can be deleted. The new manifest is also saved automatically.
        </p>
      </div>
    </div>
  );
}
