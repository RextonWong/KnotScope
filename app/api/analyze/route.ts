import { NextRequest, NextResponse } from "next/server";
import { analyzeBoard } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (
    typeof body !== "object" ||
    body === null ||
    !("frontImage" in body) ||
    !("backImage" in body)
  ) {
    return NextResponse.json(
      { error: "frontImage and backImage are required" },
      { status: 400 }
    );
  }

  const { frontImage, backImage } = body as { frontImage: unknown; backImage: unknown };

  if (typeof frontImage !== "string" || !frontImage) {
    return NextResponse.json({ error: "frontImage must be a non-empty base64 string" }, { status: 400 });
  }
  if (typeof backImage !== "string" || !backImage) {
    return NextResponse.json({ error: "backImage must be a non-empty base64 string" }, { status: 400 });
  }

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
    console.error("[analyze] Gemini error:", err);
    const message = err instanceof Error ? err.message : "Analysis failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
