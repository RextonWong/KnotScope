import { NextRequest, NextResponse } from "next/server";
import { analyzePlank6 } from "@/lib/gemini6";
import type { PlankDimensions, SurfaceId } from "@/lib/plank";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";

// 6-face analysis is more expensive — lower rate limit.
const RATE_LIMIT_MAX = 10;
// ~5 MB per surface image.
const MAX_IMAGE_B64_BYTES = 5 * 1024 * 1024;
// Dimension bounds (mm).
const DIM_BOUNDS = { min: 10, max: 10_000 };

const SURFACE_IDS: SurfaceId[] = ["front", "back", "top", "bottom", "left", "right"];

interface IncomingSurface { base64: unknown; mime?: unknown }

function isPlankDims(x: unknown): x is PlankDimensions {
  if (typeof x !== "object" || x === null) return false;
  const d = x as Record<string, unknown>;
  return (
    typeof d.length_mm === "number" && d.length_mm >= DIM_BOUNDS.min && d.length_mm <= DIM_BOUNDS.max &&
    typeof d.width_mm === "number" && d.width_mm >= DIM_BOUNDS.min && d.width_mm <= DIM_BOUNDS.max &&
    typeof d.thickness_mm === "number" && d.thickness_mm >= DIM_BOUNDS.min && d.thickness_mm <= DIM_BOUNDS.max
  );
}

function isSafeMime(mime: unknown): mime is string {
  const allowed = ["image/jpeg", "image/png", "image/webp"];
  return typeof mime === "string" && allowed.includes(mime);
}

export async function POST(req: NextRequest) {
  // ── Rate limit ────────────────────────────────────────────────────────────
  const ip = clientIp(req);
  const rl = checkRateLimit(`6:${ip}`, RATE_LIMIT_MAX);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before analysing again." },
      {
        status: 429,
        headers: { "Retry-After": String(rl.retryAfterSec ?? 60) },
      }
    );
  }

  // ── Parse body ────────────────────────────────────────────────────────────
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Request body must be an object" }, { status: 400 });
  }

  const { dimensions, surfaces } = body as { dimensions?: unknown; surfaces?: unknown };

  // ── Validate dimensions ───────────────────────────────────────────────────
  if (!isPlankDims(dimensions)) {
    return NextResponse.json(
      { error: "dimensions must include length_mm, width_mm, thickness_mm (each 10–10000 mm)" },
      { status: 400 }
    );
  }

  // ── Validate surfaces ─────────────────────────────────────────────────────
  if (typeof surfaces !== "object" || surfaces === null) {
    return NextResponse.json({ error: "surfaces must be an object with all 6 faces" }, { status: 400 });
  }

  const surfaceMap = surfaces as Record<string, IncomingSurface | undefined>;
  for (const s of SURFACE_IDS) {
    const v = surfaceMap[s];
    if (!v || typeof v.base64 !== "string" || !v.base64) {
      return NextResponse.json({ error: `surfaces.${s}.base64 must be a non-empty string` }, { status: 400 });
    }
    if (v.base64.length > MAX_IMAGE_B64_BYTES) {
      return NextResponse.json({ error: `surfaces.${s} exceeds the 5 MB limit` }, { status: 413 });
    }
    if (v.mime !== undefined && !isSafeMime(v.mime)) {
      return NextResponse.json(
        { error: `surfaces.${s}.mime must be image/jpeg, image/png, or image/webp` },
        { status: 400 }
      );
    }
  }

  // ── Build typed surface map ───────────────────────────────────────────────
  const built: Record<SurfaceId, { base64: string; mime: string }> = {
    front: { base64: "", mime: "image/jpeg" },
    back:  { base64: "", mime: "image/jpeg" },
    top:   { base64: "", mime: "image/jpeg" },
    bottom:{ base64: "", mime: "image/jpeg" },
    left:  { base64: "", mime: "image/jpeg" },
    right: { base64: "", mime: "image/jpeg" },
  };
  for (const s of SURFACE_IDS) {
    const v = surfaceMap[s] as { base64: string; mime?: unknown };
    built[s] = {
      base64: v.base64,
      mime: isSafeMime(v.mime) ? v.mime : "image/jpeg",
    };
  }

  // ── Analyse ───────────────────────────────────────────────────────────────
  try {
    const analysis = await analyzePlank6(dimensions, built);
    if (!analysis.is_lumber) {
      return NextResponse.json(
        { error: "Surfaces do not appear to show a wooden plank. Please check your images." },
        { status: 422 }
      );
    }
    return NextResponse.json(analysis);
  } catch (err) {
    console.error("[analyze6] error:", err);
    return NextResponse.json({ error: "Analysis failed. Please try again." }, { status: 500 });
  }
}
