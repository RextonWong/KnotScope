import { z } from "zod";

export type SurfaceId = "front" | "back" | "top" | "bottom" | "left" | "right";

export const SURFACE_IDS: readonly SurfaceId[] = [
  "front",
  "back",
  "top",
  "bottom",
  "left",
  "right",
] as const;

export const SurfaceIdSchema = z.enum(["front", "back", "top", "bottom", "left", "right"]);

export interface PlankDimensions {
  length_mm: number;
  width_mm: number;
  thickness_mm: number;
}

export const DEFAULT_DIMENSIONS: PlankDimensions = {
  length_mm: 2400,
  width_mm: 150,
  thickness_mm: 25,
};

export const DIMENSION_LIMITS = {
  length_mm: { min: 300, max: 4000, step: 50 },
  width_mm: { min: 50, max: 400, step: 5 },
  thickness_mm: { min: 10, max: 80, step: 1 },
} as const;

export type KnotShape = "circle" | "ellipse" | "oval" | "spike" | "irregular";

export const KNOT_SHAPES: readonly KnotShape[] = [
  "circle",
  "ellipse",
  "oval",
  "spike",
  "irregular",
] as const;

export type KnotType = "live" | "dead";

export interface EditableKnot {
  id: string;
  surface: SurfaceId;
  u: number;
  v: number;
  diameter_mm: number;
  aspect_ratio: number;
  rotation_deg: number;
  shape: KnotShape;
  type: KnotType;
  darkness: number;
}

export interface PlankProject {
  dimensions: PlankDimensions;
  knots: EditableKnot[];
}

export function makeDefaultKnot(surface: SurfaceId, u: number, v: number): EditableKnot {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    surface,
    u,
    v,
    diameter_mm: 20,
    aspect_ratio: 1,
    rotation_deg: 0,
    shape: "circle",
    type: "live",
    darkness: 0.5,
  };
}

// Real-world dimensions of each surface, in mm.
// Surfaces are addressed in their natural orientation:
//   front/back  → length × width   (long, broad faces)
//   top/bottom  → length × thickness (long, thin edges along the side)
//   left/right  → width × thickness  (short end-grain faces)
export function getSurfaceSize(
  surface: SurfaceId,
  dims: PlankDimensions
): { width_mm: number; height_mm: number } {
  switch (surface) {
    case "front":
    case "back":
      return { width_mm: dims.length_mm, height_mm: dims.width_mm };
    case "top":
    case "bottom":
      return { width_mm: dims.length_mm, height_mm: dims.thickness_mm };
    case "left":
    case "right":
      return { width_mm: dims.width_mm, height_mm: dims.thickness_mm };
  }
}

// What is the opposite surface? Used for through-knot pair reasoning.
export function oppositeSurface(s: SurfaceId): SurfaceId {
  const pairs: Record<SurfaceId, SurfaceId> = {
    front: "back",
    back: "front",
    top: "bottom",
    bottom: "top",
    left: "right",
    right: "left",
  };
  return pairs[s];
}

// Human-readable axis pair for the prompt: which axis is mirrored between
// these two opposite faces.
export function mirrorAxisFor(s: SurfaceId): "u" | "v" {
  // front↔back: mirror along U (length) because the board flipped over its
  //   long axis. Knot at u on front ↔ knot at (1-u) on back, same v.
  // top↔bottom: same — mirror along U.
  // left↔right: mirror along U too (width dimension).
  // In all cases the "long" axis of the surface is U and v stays put.
  switch (s) {
    case "front":
    case "back":
    case "top":
    case "bottom":
    case "left":
    case "right":
      return "u";
  }
}

// Convert editable knot uv + size into a 0–1000 bbox tuple (ymin, xmin, ymax, xmax)
// matching Gemini's native format. Used by the renderer for any debug overlays
// and by detection-side parsing.
export function knotToBbox(
  knot: EditableKnot,
  surface: SurfaceId,
  dims: PlankDimensions
): [number, number, number, number] {
  const s = getSurfaceSize(surface, dims);
  const halfW_mm = (knot.diameter_mm * Math.max(1, knot.aspect_ratio)) / 2;
  const halfH_mm = (knot.diameter_mm / Math.max(1, knot.aspect_ratio)) / 2;
  const cx = knot.u * s.width_mm;
  const cy = knot.v * s.height_mm;
  const xmin = Math.max(0, ((cx - halfW_mm) / s.width_mm) * 1000);
  const xmax = Math.min(1000, ((cx + halfW_mm) / s.width_mm) * 1000);
  const ymin = Math.max(0, ((cy - halfH_mm) / s.height_mm) * 1000);
  const ymax = Math.min(1000, ((cy + halfH_mm) / s.height_mm) * 1000);
  return [ymin, xmin, ymax, xmax];
}
