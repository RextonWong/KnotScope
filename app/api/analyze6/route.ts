import { NextRequest, NextResponse } from "next/server";
import { analyzePlank6 } from "@/lib/gemini6";
import type { PlankDimensions, SurfaceId } from "@/lib/plank";

interface IncomingSurface {
  base64: unknown;
  mime?: unknown;
}

const SURFACE_IDS: SurfaceId[] = ["front", "back", "top", "bottom", "left", "right"];

function isPlankDims(x: unknown): x is PlankDimensions {
  return (
    typeof x === "object" &&
    x !== null &&
    typeof (x as Record<string, unknown>).length_mm === "number" &&
    typeof (x as Record<string, unknown>).width_mm === "number" &&
    typeof (x as Record<string, unknown>).thickness_mm === "number"
  );
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
  }

  const { dimensions, surfaces } = body as {
    dimensions?: unknown;
    surfaces?: unknown;
  };

  if (!isPlankDims(dimensions)) {
    return NextResponse.json(
      { error: "dimensions must include length_mm, width_mm, thickness_mm" },
      { status: 400 }
    );
  }

  if (typeof surfaces !== "object" || surfaces === null) {
    return NextResponse.json({ error: "surfaces must be an object with all 6 faces" }, { status: 400 });
  }

  const surfaceMap = surfaces as Record<string, IncomingSurface | undefined>;
  for (const s of SURFACE_IDS) {
    const v = surfaceMap[s];
    if (!v || typeof v.base64 !== "string" || !v.base64) {
      return NextResponse.json(
        { error: `surfaces.${s} must include a non-empty base64 string` },
        { status: 400 }
      );
    }
  }

  const built: Record<SurfaceId, { base64: string; mime?: string }> = {
    front: { base64: "" }, back: { base64: "" }, top: { base64: "" },
    bottom: { base64: "" }, left: { base64: "" }, right: { base64: "" },
  };
  for (const s of SURFACE_IDS) {
    const v = surfaceMap[s] as { base64: string; mime?: unknown };
    built[s] = {
      base64: v.base64,
      mime: typeof v.mime === "string" ? v.mime : "image/jpeg",
    };
  }

  try {
    const analysis = await analyzePlank6(dimensions, built);
    if (!analysis.is_lumber) {
      return NextResponse.json(
        { error: "Surfaces do not appear to show a wooden plank." },
        { status: 422 }
      );
    }
    return NextResponse.json(analysis);
  } catch (err) {
    console.error("[analyze6] Gemini error:", err);
    const msg = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
