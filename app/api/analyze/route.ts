import { NextRequest, NextResponse } from "next/server";
import { analyzeBoard } from "@/lib/gemini";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";

// ~5 MB per image is generous for a real board photo.
const MAX_IMAGE_B64_BYTES = 5 * 1024 * 1024;
// 15 requests per minute per IP — enough for normal interactive use.
const RATE_LIMIT_MAX = 15;

export async function POST(req: NextRequest) {
  // ── Rate limit ────────────────────────────────────────────────────────────
  const ip = clientIp(req);
  const rl = checkRateLimit(ip, RATE_LIMIT_MAX);
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

  const { frontImage, backImage } = body as Record<string, unknown>;

  if (typeof frontImage !== "string" || !frontImage) {
    return NextResponse.json({ error: "frontImage must be a non-empty base64 string" }, { status: 400 });
  }
  if (typeof backImage !== "string" || !backImage) {
    return NextResponse.json({ error: "backImage must be a non-empty base64 string" }, { status: 400 });
  }

  // ── Size guard ────────────────────────────────────────────────────────────
  if (frontImage.length > MAX_IMAGE_B64_BYTES) {
    return NextResponse.json({ error: "frontImage exceeds the 5 MB limit" }, { status: 413 });
  }
  if (backImage.length > MAX_IMAGE_B64_BYTES) {
    return NextResponse.json({ error: "backImage exceeds the 5 MB limit" }, { status: 413 });
  }

  // ── Analyse ───────────────────────────────────────────────────────────────
  try {
    const analysis = await analyzeBoard(frontImage, backImage);
    if (!analysis.is_lumber) {
      return NextResponse.json(
        { error: "Images do not appear to show a wooden board. Please upload front and back photos of actual lumber." },
        { status: 422 }
      );
    }
    return NextResponse.json(analysis);
  } catch (err) {
    console.error("[analyze] error:", err);
    return NextResponse.json({ error: "Analysis failed. Please try again." }, { status: 500 });
  }
}
