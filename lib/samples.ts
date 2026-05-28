import type { PlankProject } from "./plank";

export interface SamplePreset {
  id: string;
  label: string;
  description: string;
  project: PlankProject;
}

// Four knot-type presets based on Fig 6 of the grading paper.
// Each corresponds to a canonical knot shape / position category used in EN 1310.
//
// All use default 2400 × 150 × 25 mm dimensions so the rendered images
// have realistic aspect ratios and the AI gets correct scale context.

export const SAMPLE_PRESETS: SamplePreset[] = [
  // ── Row 1: Round & oval knots + spike (lancet) knots ────────────────────
  // Small discrete knots. Round/oval knots have d_min ≈ d_max;
  // spike/lancet knots are elongated with d_min << d_max.
  {
    id: "round-oval",
    label: "Round / Oval",
    description: "Small discrete knots — round, oval, and spike (lancet) variants. The paired round knot demonstrates through-knot detection.",
    project: {
      dimensions: { length_mm: 2400, width_mm: 150, thickness_mm: 25 },
      knots: [
        // Round knot with through-tunnel
        {
          id: "ro-k1",
          surface: "front",
          u: 0.13, v: 0.38,
          diameter_mm: 26, aspect_ratio: 1, rotation_deg: 0,
          shape: "circle", type: "live", darkness: 0.55,
          tunnel: { exit_kind: "through", exit_diameter_mm: 24, exit_du: 0, exit_dv: 0, depth_factor: 0.5 },
        },
        // Oval knot
        {
          id: "ro-k2",
          surface: "front",
          u: 0.27, v: 0.65,
          diameter_mm: 21, aspect_ratio: 1.6, rotation_deg: 18,
          shape: "ellipse", type: "live", darkness: 0.5,
        },
        // Dead round knot
        {
          id: "ro-k3",
          surface: "front",
          u: 0.44, v: 0.30,
          diameter_mm: 19, aspect_ratio: 1, rotation_deg: 0,
          shape: "circle", type: "dead", darkness: 0.70,
        },
        // Spike (lancet) knot
        {
          id: "ro-k4",
          surface: "front",
          u: 0.68, v: 0.28,
          diameter_mm: 17, aspect_ratio: 3.8, rotation_deg: 10,
          shape: "spike", type: "dead", darkness: 0.65,
        },
        // Narrow spike near edge
        {
          id: "ro-k5",
          surface: "front",
          u: 0.84, v: 0.72,
          diameter_mm: 14, aspect_ratio: 3.2, rotation_deg: -7,
          shape: "spike", type: "dead", darkness: 0.62,
        },
      ],
    },
  },

  // ── Row 2: Wide face knots (splay / flat knots) ──────────────────────────
  // Knots with large d_max relative to d_min — the branch intersects the
  // face at a shallow angle, creating a wide, flat ellipse.
  {
    id: "wide-face",
    label: "Wide Face Knots",
    description: "Splay knots where the branch hits the face at a shallow angle, producing a wide, flat cross-section. d_max is much larger than d_min.",
    project: {
      dimensions: { length_mm: 2400, width_mm: 150, thickness_mm: 25 },
      knots: [
        {
          id: "wf-k1",
          surface: "front",
          u: 0.17, v: 0.50,
          diameter_mm: 36, aspect_ratio: 3.6, rotation_deg: 0,
          shape: "oval", type: "live", darkness: 0.58,
        },
        {
          id: "wf-k2",
          surface: "front",
          u: 0.48, v: 0.50,
          diameter_mm: 42, aspect_ratio: 4.2, rotation_deg: 0,
          shape: "oval", type: "dead", darkness: 0.72,
        },
        {
          id: "wf-k3",
          surface: "front",
          u: 0.79, v: 0.50,
          diameter_mm: 33, aspect_ratio: 3.3, rotation_deg: 0,
          shape: "oval", type: "live", darkness: 0.53,
        },
      ],
    },
  },

  // ── Row 3: Spike knot (longitudinal / grain-parallel) ───────────────────
  // A single large spike knot running along the grain. d_min is small,
  // d_max spans most of the board length. Demonstrates the extreme
  // aspect ratio Gemini must reason about.
  {
    id: "spike-longitudinal",
    label: "Spike Knot",
    description: "One large spike knot running parallel to the grain. d_max spans most of the board length while d_min is small — a challenging case for graders.",
    project: {
      dimensions: { length_mm: 2400, width_mm: 150, thickness_mm: 25 },
      knots: [
        {
          id: "sp-k1",
          surface: "front",
          u: 0.50, v: 0.32,
          diameter_mm: 20, aspect_ratio: 10, rotation_deg: 0,
          shape: "spike", type: "live", darkness: 0.63,
          tunnel: { exit_kind: "through", exit_diameter_mm: 18, exit_du: 0, exit_dv: 0, depth_factor: 0.5 },
        },
      ],
    },
  },

  // ── Row 4: Edge & arris knots ────────────────────────────────────────────
  // Knots that intersect the edge of the board. Visible on both the face
  // and the adjacent edge surface. d_min measured on the edge, d_max on
  // the face. Some are "arris knots" crossing the corner (both face + edge).
  {
    id: "edge-arris",
    label: "Edge / Arris Knots",
    description: "Knots intersecting the board edge or corner. Each knot appears on both the face and edge surface; some are arris knots crossing two surfaces at once.",
    project: {
      dimensions: { length_mm: 2400, width_mm: 150, thickness_mm: 25 },
      knots: [
        // Arris knot — front face, top edge (v≈0)
        {
          id: "ea-k1",
          surface: "front",
          u: 0.18, v: 0.04,
          diameter_mm: 28, aspect_ratio: 2.2, rotation_deg: 90,
          shape: "spike", type: "dead", darkness: 0.70,
        },
        // Same arris knot visible on top surface
        {
          id: "ea-k2",
          surface: "top",
          u: 0.18, v: 0.60,
          diameter_mm: 22, aspect_ratio: 1.4, rotation_deg: 0,
          shape: "oval", type: "dead", darkness: 0.65,
        },
        // Edge knot — front face, bottom edge (v≈1), with tunnel
        {
          id: "ea-k3",
          surface: "front",
          u: 0.55, v: 0.97,
          diameter_mm: 32, aspect_ratio: 2.4, rotation_deg: -88,
          shape: "spike", type: "live", darkness: 0.58,
          tunnel: { exit_kind: "through", exit_diameter_mm: 28, exit_du: 0, exit_dv: 0, depth_factor: 0.5 },
        },
        // Bottom surface counterpart
        {
          id: "ea-k4",
          surface: "bottom",
          u: 0.55, v: 0.40,
          diameter_mm: 26, aspect_ratio: 1.6, rotation_deg: 0,
          shape: "oval", type: "live", darkness: 0.54,
        },
        // Second arris knot, top-right
        {
          id: "ea-k5",
          surface: "front",
          u: 0.80, v: 0.06,
          diameter_mm: 24, aspect_ratio: 1.9, rotation_deg: 85,
          shape: "oval", type: "dead", darkness: 0.66,
        },
        {
          id: "ea-k6",
          surface: "top",
          u: 0.80, v: 0.55,
          diameter_mm: 20, aspect_ratio: 1.3, rotation_deg: 0,
          shape: "oval", type: "dead", darkness: 0.63,
        },
      ],
    },
  },
];
