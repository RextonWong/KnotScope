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

// A "tunnel knot" extends a surface knot with a 3D path through the plank's
// interior. The entry is the parent knot (its surface/u/v/diameter). The exit
// is on the opposite surface (`exit_kind: "through"`) or inside the wood
// (`exit_kind: "blind"`).
//
// `exit_du` / `exit_dv` are lateral offsets (in 0–1 surface coordinates) from
// the perpendicular-through path. Zero offsets = straight perpendicular tunnel.
export interface TunnelSpec {
  exit_kind: "through" | "blind";
  exit_diameter_mm: number;
  exit_du: number;
  exit_dv: number;
  depth_factor: number; // only used for "blind"; 0..1 of through-axis length
}

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
  tunnel?: TunnelSpec;
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

export function makeDefaultTunnel(parent: EditableKnot): TunnelSpec {
  return {
    exit_kind: "through",
    exit_diameter_mm: parent.diameter_mm,
    exit_du: 0,
    exit_dv: 0,
    depth_factor: 0.5,
  };
}

// Geometric mirror UV for a perpendicular straight-through tunnel from
// `entrySurface` at (u, v). This is the (u, v) on the OPPOSITE surface that
// matches the same (x, y, z) world line continued through the plank.
//
// For front/back and left/right, u flips. For top/bottom, v flips. This
// differs from the historical "always mirror u" rule that the 2-face flow
// used; the 6-face prompt is updated to match this per-pair convention.
export function geometricMirroredUv(
  entrySurface: SurfaceId,
  u: number,
  v: number
): { u: number; v: number } {
  switch (entrySurface) {
    case "front":
    case "back":
    case "left":
    case "right":
      return { u: 1 - u, v };
    case "top":
    case "bottom":
      return { u, v: 1 - v };
  }
}

// Resolved exit position on the opposite surface for "through" tunnels.
// Returns null for blind tunnels or non-tunnel knots.
export function tunnelExitOnOpposite(
  knot: EditableKnot
): { u: number; v: number } | null {
  if (!knot.tunnel || knot.tunnel.exit_kind !== "through") return null;
  const mirror = geometricMirroredUv(knot.surface, knot.u, knot.v);
  return {
    u: Math.max(0, Math.min(1, mirror.u + knot.tunnel.exit_du)),
    v: Math.max(0, Math.min(1, mirror.v + knot.tunnel.exit_dv)),
  };
}

// Which physical dimension is the "through axis" for a tunnel entering this
// surface? Returns the dimension in mm.
export function throughAxisMm(surface: SurfaceId, dims: PlankDimensions): number {
  switch (surface) {
    case "front":
    case "back":
      return dims.thickness_mm;
    case "top":
    case "bottom":
      return dims.width_mm;
    case "left":
    case "right":
      return dims.length_mm;
  }
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
