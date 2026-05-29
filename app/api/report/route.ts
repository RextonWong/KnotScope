import { NextRequest, NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import type { DocumentProps } from "@react-pdf/renderer";
import type { ReactElement } from "react";
import { AnalysisSchema } from "@/lib/schema";
import { ReportDocument } from "@/lib/pdf";
import { checkRateLimit, clientIp } from "@/lib/rateLimit";

const MAX_IMAGE_B64_BYTES = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const rl = checkRateLimit(`report:${clientIp(req)}`, 10);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please wait before generating another report." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec ?? 60) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (typeof body !== "object" || body === null) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const { analysis: rawAnalysis, frontImage, backImage, boardId } = body as Record<string, unknown>;

  if (typeof frontImage !== "string" || typeof backImage !== "string") {
    return NextResponse.json({ error: "frontImage and backImage are required strings" }, { status: 400 });
  }

  if (frontImage.length > MAX_IMAGE_B64_BYTES || backImage.length > MAX_IMAGE_B64_BYTES) {
    return NextResponse.json({ error: "Image exceeds the 5 MB limit" }, { status: 413 });
  }

  let analysis;
  try {
    analysis = AnalysisSchema.parse(rawAnalysis);
  } catch {
    return NextResponse.json({ error: "Invalid analysis data" }, { status: 400 });
  }

  const timestamp = new Date().toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  try {
    const element = createElement(ReportDocument, {
      analysis,
      frontImage,
      backImage,
      boardId: typeof boardId === "string" ? boardId : undefined,
      timestamp,
    }) as unknown as ReactElement<DocumentProps>;

    const buffer = await renderToBuffer(element);
    const uint8 = new Uint8Array(buffer);

    return new NextResponse(uint8, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="knotscope-${typeof boardId === "string" ? boardId : "report"}.pdf"`,
      },
    });
  } catch (err) {
    console.error("[report] PDF generation error:", err);
    return NextResponse.json({ error: "Failed to generate PDF" }, { status: 500 });
  }
}
