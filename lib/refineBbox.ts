// Bounding-box refinement using the KNOWN authored knot geometry.
//
// Gemini loses positional precision on the extreme-aspect-ratio surface strips,
// so its reported boxes land offset from the actual knot. For the editor and
// sample/diagram flows we already know exactly which knots were rendered
// (position, size, shape, rotation, tunnel exits), so we can compute the true
// bounding box for each and snap every Gemini detection onto the nearest one.
//
// Gemini's detection is still what drives type/grade/pairing — we only correct
// the box *position* for display. Uploads (no authored knots) are returned
// unchanged, since real photos don't have the wide-strip distortion.

import type { Analysis6 } from "./schema";
import type { EditableKnot, KnotShape, PlankDimensions, SurfaceId } from "./plank";
import { getSurfaceSize, oppositeSurface, tunnelExitOnOpposite } from "./plank";

const SURFACES: SurfaceId[] = ["front", "back", "top", "bottom", "left", "right"];

interface TrueBox {
  cx: number; // center, normalized 0-1000
  cy: number;
  bbox: [number, number, number, number]; // [ymin, xmin, ymax, xmax] 0-1000
}

const clamp1000 = (v: number) => Math.max(0, Math.min(1000, v));

// Mirror the shape multipliers used by paintKnot() in renderSurface.ts so the
// computed box matches what was actually drawn.
function shapeSemiAxes(shape: KnotShape, rx: number, ry: number): [number, number] {
  switch (shape) {
    case "spike":     return [rx * 1.6, ry * 0.4];
    case "oval":      return [rx * 1.2, ry * 0.85];
    case "circle":  { const m = Math.max(rx, ry); return [m, m]; }
    case "irregular": return [rx * 1.1, ry * 1.1];
    default:          return [rx, ry]; // ellipse
  }
}

function boxFor(
  surface: SurfaceId,
  u: number, v: number,
  diameter_mm: number, aspect_ratio: number, rotation_deg: number,
  shape: KnotShape,
  dims: PlankDimensions
): TrueBox {
  const size = getSurfaceSize(surface, dims);
  const baseR = diameter_mm / 2;
  const ar = Math.max(0.3, Math.min(3, aspect_ratio || 1));
  const rx = baseR * (ar >= 1 ? ar : 1);
  const ry = baseR * (ar >= 1 ? 1 : 1 / ar);
  const [ax, ay] = shapeSemiAxes(shape, rx, ry); // semi-axes in mm

  // Axis-aligned half-extents of the rotated ellipse, +10% pad.
  const th = (rotation_deg || 0) * Math.PI / 180;
  const c = Math.abs(Math.cos(th)), s = Math.abs(Math.sin(th));
  const hx = Math.sqrt((ax * c) ** 2 + (ay * s) ** 2) * 1.1;
  const hy = Math.sqrt((ax * s) ** 2 + (ay * c) ** 2) * 1.1;

  const cxMm = u * size.width_mm, cyMm = v * size.height_mm;
  return {
    cx: u * 1000,
    cy: v * 1000,
    bbox: [
      clamp1000(((cyMm - hy) / size.height_mm) * 1000),
      clamp1000(((cxMm - hx) / size.width_mm) * 1000),
      clamp1000(((cyMm + hy) / size.height_mm) * 1000),
      clamp1000(((cxMm + hx) / size.width_mm) * 1000),
    ],
  };
}

function authoredBoxes(
  knots: EditableKnot[],
  dims: PlankDimensions
): Record<SurfaceId, TrueBox[]> {
  const out: Record<SurfaceId, TrueBox[]> = {
    front: [], back: [], top: [], bottom: [], left: [], right: [],
  };
  for (const k of knots) {
    out[k.surface].push(
      boxFor(k.surface, k.u, k.v, k.diameter_mm, k.aspect_ratio, k.rotation_deg, k.shape, dims)
    );
    // Through-tunnels paint an exit disc on the opposite face — add it too.
    if (k.tunnel?.exit_kind === "through") {
      const exit = tunnelExitOnOpposite(k);
      if (exit) {
        const opp = oppositeSurface(k.surface);
        out[opp].push(
          boxFor(opp, exit.u, exit.v, k.tunnel.exit_diameter_mm, k.aspect_ratio, k.rotation_deg, k.shape, dims)
        );
      }
    }
  }
  return out;
}

/**
 * Snap each detected knot's bbox onto the nearest authored knot box on the same
 * surface. If `knots` is omitted (e.g. a real photo upload), the analysis is
 * returned unchanged.
 */
export function refineAnalysisBboxes(
  analysis: Analysis6,
  dims: PlankDimensions,
  knots?: EditableKnot[]
): Analysis6 {
  if (!knots || knots.length === 0) return analysis;

  const authored = authoredBoxes(knots, dims);
  const surfaces = { ...analysis.surfaces };

  for (const s of SURFACES) {
    const dets = analysis.surfaces[s];
    const cands = authored[s];
    if (!dets?.length || !cands.length) continue;

    const used = new Set<number>();
    surfaces[s] = dets.map((k) => {
      const [ymin, xmin, ymax, xmax] = k.bbox;
      const kcx = (xmin + xmax) / 2, kcy = (ymin + ymax) / 2;

      let best = -1, bestD = Infinity;
      cands.forEach((cand, i) => {
        if (used.has(i)) return;
        const d = Math.hypot(cand.cx - kcx, cand.cy - kcy);
        if (d < bestD) { bestD = d; best = i; }
      });

      // Generous cap so we still match despite Gemini's large offset, but not
      // so loose we snap a stray detection onto an unrelated knot.
      if (best >= 0 && bestD < 480) {
        used.add(best);
        return { ...k, bbox: cands[best].bbox };
      }
      return k;
    });
  }

  return { ...analysis, surfaces };
}
