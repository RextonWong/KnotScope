#!/usr/bin/env npx ts-node
/**
 * Downloads wood-knot images from Wikimedia Commons and saves them
 * as front/back pairs in /public/samples/.
 *
 * Usage: npx ts-node scripts/fetch-samples.ts
 */

import * as fs from "fs";
import * as path from "path";
import * as https from "https";
import * as http from "http";
import { URL } from "url";

const OUTPUT_DIR = path.join(process.cwd(), "public", "samples");

interface SampleManifestEntry {
  id: string;
  species: string;
  front: string;
  back: string;
}

const USER_AGENT =
  "KnotScope/1.0 (lumber-inspection demo; Node.js) github.com/knotscope";

function httpsGet(url: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      { timeout: 15000, headers: { "User-Agent": USER_AGENT } },
      (res) => {
        let body = "";
        res.on("data", (c: Buffer) => { body += c.toString(); });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body }));
      }
    );
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error("Timeout")); });
  });
}

function downloadBinary(url: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const protocol = parsedUrl.protocol === "https:" ? https : http;
    const file = fs.createWriteStream(dest);

    const req = protocol.get(
      url,
      { timeout: 30000, headers: { "User-Agent": USER_AGENT } },
      (res) => {
        if (
          (res.statusCode === 301 || res.statusCode === 302) &&
          res.headers.location
        ) {
          file.destroy();
          fs.unlinkSync(dest);
          downloadBinary(res.headers.location, dest).then(resolve).catch(reject);
          return;
        }
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          file.destroy();
          if (fs.existsSync(dest)) fs.unlinkSync(dest);
          reject(new Error(`HTTP ${res.statusCode ?? "?"}`));
          return;
        }
        res.pipe(file);
        file.on("finish", () => { file.close(); resolve(); });
        res.on("error", (e) => {
          file.destroy();
          if (fs.existsSync(dest)) fs.unlinkSync(dest);
          reject(e);
        });
      }
    );
    req.on("error", (e) => {
      file.destroy();
      if (fs.existsSync(dest)) fs.unlinkSync(dest);
      reject(e);
    });
  });
}

// These are real Wikimedia Commons API thumbnail URLs — constructed via:
// https://commons.wikimedia.org/w/api.php?action=query&titles=File:NAME&prop=imageinfo&iiprop=url&iiurlwidth=640&format=json
const KNOWN_COMMONS_FILES = [
  { file: "Knot_in_plank.jpg", species: "Pine" },
  { file: "Wood_knot.jpg", species: "Oak" },
  { file: "Knot_(wood).jpg", species: "Fir" },
  { file: "Wooden_plank_with_knot.jpg", species: "Spruce" },
];

interface CommonsImageInfoResponse {
  query?: {
    pages?: Record<
      string,
      {
        title?: string;
        imageinfo?: Array<{ url?: string; thumburl?: string }>;
      }
    >;
  };
}

async function resolveThumbUrl(file: string): Promise<string | null> {
  const apiUrl =
    `https://commons.wikimedia.org/w/api.php?action=query` +
    `&titles=${encodeURIComponent("File:" + file)}` +
    `&prop=imageinfo&iiprop=url&iiurlwidth=640&format=json&origin=*`;
  try {
    const { status, body } = await httpsGet(apiUrl);
    if (status !== 200) return null;
    const data = JSON.parse(body) as CommonsImageInfoResponse;
    const pages = Object.values(data.query?.pages ?? {});
    for (const page of pages) {
      const info = page.imageinfo?.[0];
      const url = info?.thumburl ?? info?.url;
      if (url) return url;
    }
  } catch {
    // ignore
  }
  return null;
}

async function batchResolveThumbUrls(
  titles: string[]
): Promise<Array<string | null>> {
  // Batch all titles in a single API call (Wikimedia allows pipe-separated titles)
  const titlesParam = titles.map((t) => `File:${t}`).join("|");
  const apiUrl =
    `https://commons.wikimedia.org/w/api.php?action=query` +
    `&titles=${encodeURIComponent(titlesParam)}` +
    `&prop=imageinfo&iiprop=url&iiurlwidth=640&format=json&origin=*`;

  try {
    const { status, body } = await httpsGet(apiUrl);
    if (status !== 200) return titles.map(() => null);
    const data = JSON.parse(body) as CommonsImageInfoResponse;
    const pages = data.query?.pages ?? {};

    // Build a map: file title (lowercase, no "File:") -> url
    const urlMap = new Map<string, string>();
    for (const page of Object.values(pages)) {
      const title = (page.title ?? "").replace(/^File:/i, "").toLowerCase();
      const url = page.imageinfo?.[0]?.thumburl ?? page.imageinfo?.[0]?.url;
      if (url) urlMap.set(title, url);
    }

    return titles.map((t) => urlMap.get(t.toLowerCase()) ?? null);
  } catch {
    return titles.map(() => null);
  }
}

async function searchCommonsForWoodKnots(): Promise<
  Array<{ url: string; species: string }>
> {
  const SPECIES = ["Pine", "Oak", "Fir", "Spruce"];

  // Step 1: search for file names
  const searchUrl =
    `https://commons.wikimedia.org/w/api.php?action=query&list=search` +
    `&srsearch=wood+knot&srnamespace=6&srlimit=16&format=json&origin=*`;

  let candidateTitles: string[] = KNOWN_COMMONS_FILES.map((f) => f.file);
  try {
    const { status, body } = await httpsGet(searchUrl);
    if (status === 200) {
      const data = JSON.parse(body) as {
        query?: { search?: Array<{ title: string }> };
      };
      const searched =
        data.query?.search
          ?.map((r) => r.title.replace(/^File:/, ""))
          .filter((t) => /\.(jpg|jpeg|png|webp)$/i.test(t)) ?? [];
      // prepend search results, keep known as fallback
      candidateTitles = [
        ...searched,
        ...KNOWN_COMMONS_FILES.map((f) => f.file),
      ].slice(0, 16);
    }
  } catch {
    // fall through to known list
  }

  // Step 2: batch image info lookup — 1 request for all
  const urls = await batchResolveThumbUrls(candidateTitles);

  const results: Array<{ url: string; species: string }> = [];
  for (let i = 0; i < urls.length && results.length < 4; i++) {
    const url = urls[i];
    if (url) results.push({ url, species: SPECIES[results.length] });
  }

  return results;
}

async function main() {
  console.log("Fetching sample wood-knot images from Wikimedia Commons…");

  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const images = await searchCommonsForWoodKnots();

  if (images.length === 0) {
    console.log(
      "\nNo images found via Wikimedia API (may be a network/rate-limit issue)."
    );
    console.log(
      "Place your own JPEGs in public/samples/ named board-01-front.jpg etc."
    );
    console.log("and update public/samples/manifest.json accordingly.");
    fs.writeFileSync(
      path.join(OUTPUT_DIR, "manifest.json"),
      JSON.stringify([], null, 2)
    );
    return;
  }

  const manifest: SampleManifestEntry[] = [];

  for (let i = 0; i < images.length; i++) {
    const { url, species } = images[i];
    const boardNum = String(i + 1).padStart(2, "0");
    const boardId = `board-${boardNum}`;
    const frontPath = path.join(OUTPUT_DIR, `${boardId}-front.jpg`);
    const backPath = path.join(OUTPUT_DIR, `${boardId}-back.jpg`);

    process.stdout.write(`  ${boardId} (${species})… `);
    try {
      await downloadBinary(url, frontPath);
      fs.copyFileSync(frontPath, backPath);
      console.log("✓");
      manifest.push({
        id: boardId,
        species,
        front: `/samples/${boardId}-front.jpg`,
        back: `/samples/${boardId}-back.jpg`,
      });
    } catch (err) {
      console.log(`✗ ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  fs.writeFileSync(
    path.join(OUTPUT_DIR, "manifest.json"),
    JSON.stringify(manifest, null, 2)
  );

  console.log(`\nDone. ${manifest.length} board(s) in public/samples/`);
  console.log("NOTE: These are not true front/back pairs — same image used for both faces.");
  console.log("For genuine through-knot demos, upload real flipped-pair photos.");
}

main().catch(console.error);
