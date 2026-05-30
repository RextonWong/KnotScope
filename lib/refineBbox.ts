// Image-based bounding-box refinement.
//
// Gemini 3.5 Flash loses horizontal precision on the extreme-aspect-ratio
// surface strips (broad faces are ~16:1), so its reported boxes are often
// offset from the actual knot. This pass decodes each rendered surface image,
// searches a window around Gemini's box for the real dark knot blob, and
// re-centres the box on it. Purely client-side (Canvas getImageData).
//
// Conservative by design: if no clear dark blob is found near Gemini's guess,
// or the candidate looks like a wood-grain line, the original box is kept.

import type { Analysis6 } from "./schema";
import type { SurfaceId } from "./plank";

const SURFACES: SurfaceId[] = ["front", "back", "top", "bottom", "left", "right"];

interface Lum {
  data: Float32Array; // luminance 0..255, length w*h
  w: number;
  h: number;
}

function loadLuminance(base64: string): Promise<Lum | null> {
  return new Promise((resolve) => {
    if (!base64) { resolve(null); return; }
    let settled = false;
    const done = (val: Lum | null) => { if (!settled) { settled = true; resolve(val); } };
    // Hard timeout: never let a stuck image decode block the analysis flow.
    const timer = setTimeout(() => done(null), 3000);

    const img = new Image();
    img.onload = () => {
      clearTimeout(timer);
      try {
        const w = img.naturalWidth, h = img.naturalHeight;
        if (w < 3 || h < 3) { done(null); return; }
        const cv = document.createElement("canvas");
        cv.width = w; cv.height = h;
        const ctx = cv.getContext("2d", { willReadFrequently: true });
        if (!ctx) { done(null); return; }
        ctx.drawImage(img, 0, 0);
        const px = ctx.getImageData(0, 0, w, h).data;
        const lum = new Float32Array(w * h);
        for (let i = 0, p = 0; i < lum.length; i++, p += 4) {
          lum[i] = 0.299 * px[p] + 0.587 * px[p + 1] + 0.114 * px[p + 2];
        }
        done({ data: lum, w, h });
      } catch {
        done(null);
      }
    };
    img.onerror = () => { clearTimeout(timer); done(null); };
    img.src = `data:image/jpeg;base64,${base64}`;
  });
}

// Refine a single bbox (0-1000) against the luminance image.
// Returns a new 0-1000 bbox, or null to keep the original.
function refineOne(
  lum: Lum,
  bbox: [number, number, number, number]
): [number, number, number, number] | null {
  const { data, w, h } = lum;
  const [ymin, xmin, ymax, xmax] = bbox;

  const bx0 = (xmin / 1000) * w, bx1 = (xmax / 1000) * w;
  const by0 = (ymin / 1000) * h, by1 = (ymax / 1000) * h;
  const bw = Math.max(4, bx1 - bx0), bh = Math.max(4, by1 - by0);

  // Search window: expand the box by 100% of its size on each side, so a
  // knot offset by roughly one box-width is still inside the window.
  const wx0 = Math.max(0, Math.floor(bx0 - bw));
  const wx1 = Math.min(w, Math.ceil(bx1 + bw));
  const wy0 = Math.max(0, Math.floor(by0 - bh));
  const wy1 = Math.min(h, Math.ceil(by1 + bh));
  const ww = wx1 - wx0, wh = wy1 - wy0;
  if (ww < 3 || wh < 3) return null;

  // Window luminance stats.
  let sum = 0, mn = 255, count = 0;
  for (let y = wy0; y < wy1; y++) {
    for (let x = wx0; x < wx1; x++) {
      const v = data[y * w + x];
      sum += v; count++;
      if (v < mn) mn = v;
    }
  }
  const mean = sum / count;
  // Knots are markedly darker than wood. Threshold midway between the darkest
  // pixel and the window mean — captures the dark core/body of the knot.
  const thresh = mn + 0.5 * (mean - mn);
  // If there's no real contrast (flat wood, no knot), bail.
  if (mean - mn < 18) return null;

  // Connected-components flood fill within the window on the dark mask.
  // Label array sized to the window.
  const labels = new Int32Array(ww * wh).fill(-1);
  const idx = (x: number, y: number) => (y - wy0) * ww + (x - wx0);

  interface Comp {
    area: number;
    minX: number; maxX: number; minY: number; maxY: number;
    darkMass: number;
  }
  const comps: Comp[] = [];
  const stack: number[] = [];

  for (let sy = wy0; sy < wy1; sy++) {
    for (let sx = wx0; sx < wx1; sx++) {
      if (data[sy * w + sx] > thresh) continue;
      if (labels[idx(sx, sy)] !== -1) continue;
      // New component — flood fill (4-connected).
      const comp: Comp = {
        area: 0, minX: sx, maxX: sx, minY: sy, maxY: sy, darkMass: 0,
      };
      const label = comps.length;
      stack.length = 0;
      stack.push(sx, sy);
      labels[idx(sx, sy)] = label;
      while (stack.length) {
        const y = stack.pop()!;
        const x = stack.pop()!;
        comp.area++;
        comp.darkMass += (mean - data[y * w + x]);
        if (x < comp.minX) comp.minX = x;
        if (x > comp.maxX) comp.maxX = x;
        if (y < comp.minY) comp.minY = y;
        if (y > comp.maxY) comp.maxY = y;
        const neigh = [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]];
        for (const [nx, ny] of neigh) {
          if (nx < wx0 || nx >= wx1 || ny < wy0 || ny >= wy1) continue;
          if (data[ny * w + nx] > thresh) continue;
          const li = idx(nx, ny);
          if (labels[li] !== -1) continue;
          labels[li] = label;
          stack.push(nx, ny);
        }
      }
      comps.push(comp);
    }
  }

  if (!comps.length) return null;

  const windowArea = ww * wh;
  const minArea = Math.max(6, windowArea * 0.01);

  // Pick the component with the greatest dark mass that:
  //  - is big enough (not noise),
  //  - isn't a grain line spanning the full window width or height,
  //  - isn't basically the whole window (flat dark region / failure).
  let best: Comp | null = null;
  for (const c of comps) {
    if (c.area < minArea) continue;
    if (c.area > windowArea * 0.75) continue;
    const cw = c.maxX - c.minX + 1, ch = c.maxY - c.minY + 1;
    if (cw >= ww * 0.92) continue; // horizontal grain line
    if (ch >= wh * 0.92) continue; // vertical grain line
    if (!best || c.darkMass > best.darkMass) best = c;
  }
  if (!best) return null;

  // Pad the tight dark bounds slightly — the dark mask captures the core,
  // the visible knot extends a little further into its rim.
  const pcw = (best.maxX - best.minX + 1);
  const pch = (best.maxY - best.minY + 1);
  const padX = pcw * 0.18, padY = pch * 0.18;
  const rx0 = Math.max(0, best.minX - padX);
  const rx1 = Math.min(w, best.maxX + 1 + padX);
  const ry0 = Math.max(0, best.minY - padY);
  const ry1 = Math.min(h, best.maxY + 1 + padY);

  return [
    (ry0 / h) * 1000,
    (rx0 / w) * 1000,
    (ry1 / h) * 1000,
    (rx1 / w) * 1000,
  ];
}

/**
 * Return a copy of `analysis` with every detected knot's bbox refined against
 * the rendered surface images. Falls back to the original box per-knot whenever
 * a confident dark blob can't be located.
 */
export async function refineAnalysisBboxes(
  surfaceImages: Record<SurfaceId, string>,
  analysis: Analysis6
): Promise<Analysis6> {
  if (typeof document === "undefined") return analysis;
  try {
    const lums: Partial<Record<SurfaceId, Lum | null>> = {};
    await Promise.all(
      SURFACES.map(async (s) => {
        try { lums[s] = await loadLuminance(surfaceImages[s]); }
        catch { lums[s] = null; }
      })
    );

    const surfaces = { ...analysis.surfaces };
    for (const s of SURFACES) {
      const lum = lums[s];
      const knots = analysis.surfaces[s];
      if (!lum || !knots?.length) continue;
      surfaces[s] = knots.map((k) => {
        try {
          const refined = refineOne(lum, k.bbox as [number, number, number, number]);
          return refined ? { ...k, bbox: refined } : k;
        } catch {
          return k;
        }
      });
    }

    return { ...analysis, surfaces };
  } catch {
    // Never let refinement break the analysis flow — fall back to raw boxes.
    return analysis;
  }
}
