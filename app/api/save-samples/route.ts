import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";

// Dev-only route: writes rendered surface images + a new manifest to public/samples/.
// Should never be called in production — the saved static files are checked in.
export async function POST(req: Request) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 403 });
  }
  try {
    const body = await req.json() as {
      files: Record<string, string>;       // filename → base64
      manifest: unknown[];
    };
    const samplesDir = path.join(process.cwd(), "public", "samples");
    await fs.mkdir(samplesDir, { recursive: true });

    for (const [filename, base64] of Object.entries(body.files)) {
      const buf = Buffer.from(base64, "base64");
      await fs.writeFile(path.join(samplesDir, filename), buf);
    }

    await fs.writeFile(
      path.join(samplesDir, "manifest.json"),
      JSON.stringify(body.manifest, null, 2),
      "utf-8"
    );

    return NextResponse.json({ ok: true, count: Object.keys(body.files).length });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
