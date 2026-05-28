import type { PlankProject } from "./plank";

export interface SamplePreset {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  project: PlankProject;
}

export interface DiagramRow {
  label: string;
  subtitle: string;
  caseIds: string[];
}

// ── 10 knot cases from Fig 6 (EN 1310) ──────────────────────────────────────
// Row 1 skips the first two (round/oval inside-wood knots — not visible from
// outside). Rows are Face Spike, Splay, Spike, Arris.

export const SAMPLE_PRESETS: SamplePreset[] = [

  // ── Row 1: Face & edge spike knots ──────────────────────────────────────────

  {
    id: "face-spike",
    label: "Face Spike Knot",
    shortLabel: "Face Spike",
    description:
      "A lance-shaped (elongated) knot lying on the broad face of the board, " +
      "with d_max measured along the grain and d_min across. The branch cut the " +
      "face at a steep angle, producing a narrow ellipse with pointed ends.",
    project: {
      dimensions: { length_mm: 2400, width_mm: 150, thickness_mm: 25 },
      knots: [
        {
          id: "fs-k1",
          surface: "front",
          u: 0.45, v: 0.38,
          diameter_mm: 55, aspect_ratio: 5.5, rotation_deg: 8,
          shape: "spike", type: "live", darkness: 0.88,
          tunnel: { exit_kind: "through", exit_diameter_mm: 50, exit_du: 0, exit_dv: 0, depth_factor: 0.5 },
        },
      ],
    },
  },

  {
    id: "arris-spike",
    label: "Arris Spike Knot",
    shortLabel: "Arris Spike",
    description:
      "A spike knot intersecting the arris (long edge corner). Visible on the " +
      "broad face as a triangular or wedge shape at the edge, and on the adjacent " +
      "narrow edge surface. d_min is taken on the edge, d_max on the face.",
    project: {
      dimensions: { length_mm: 2400, width_mm: 150, thickness_mm: 25 },
      knots: [
        // Spike knot at top edge of front face
        {
          id: "as-k1",
          surface: "front",
          u: 0.60, v: 0.03,
          diameter_mm: 60, aspect_ratio: 4.0, rotation_deg: 80,
          shape: "spike", type: "dead", darkness: 0.88,
        },
        // Same knot visible on top narrow edge
        {
          id: "as-k2",
          surface: "top",
          u: 0.60, v: 0.50,
          diameter_mm: 18, aspect_ratio: 2.5, rotation_deg: 0,
          shape: "spike", type: "dead", darkness: 0.88,
        },
      ],
    },
  },

  {
    id: "edge-spike",
    label: "Edge Spike Knot",
    shortLabel: "Edge Spike",
    description:
      "A spike knot primarily on the narrow edge surface. Only the very tip is " +
      "visible at the face corner — the majority of the knot runs along the narrow " +
      "edge. Common in flatsawn boards near the pith.",
    project: {
      dimensions: { length_mm: 2400, width_mm: 150, thickness_mm: 25 },
      knots: [
        // Main knot on top (narrow edge) surface
        {
          id: "es-k1",
          surface: "top",
          u: 0.68, v: 0.50,
          diameter_mm: 20, aspect_ratio: 7.0, rotation_deg: 0,
          shape: "spike", type: "dead", darkness: 0.90,
        },
        // Tip barely visible at top-right of front face
        {
          id: "es-k2",
          surface: "front",
          u: 0.68, v: 0.01,
          diameter_mm: 22, aspect_ratio: 2.5, rotation_deg: 88,
          shape: "spike", type: "dead", darkness: 0.85,
        },
      ],
    },
  },

  // ── Row 2: Splay knots ───────────────────────────────────────────────────────

  {
    id: "splay-narrow",
    label: "Splay Knot — Narrow",
    shortLabel: "Splay (Narrow)",
    description:
      "A splay knot where d_max (across grain) is 2–3× d_min. The branch cut the " +
      "face at an angle, producing a wide, shallow ellipse. Narrower variant — knot " +
      "area is still low relative to face area.",
    project: {
      dimensions: { length_mm: 2400, width_mm: 150, thickness_mm: 25 },
      knots: [
        {
          id: "sn-k1",
          surface: "front",
          u: 0.28, v: 0.50,
          diameter_mm: 28, aspect_ratio: 2.0, rotation_deg: 0,
          shape: "oval", type: "live", darkness: 0.82,
          tunnel: { exit_kind: "through", exit_diameter_mm: 26, exit_du: 0, exit_dv: 0, depth_factor: 0.5 },
        },
      ],
    },
  },

  {
    id: "splay-medium",
    label: "Splay Knot — Medium",
    shortLabel: "Splay (Medium)",
    description:
      "A splay knot where d_max is 3–4× d_min. The flat cross-section begins to " +
      "occupy a significant fraction of the face width. Often the grade-limiting " +
      "defect in intermediate-quality boards.",
    project: {
      dimensions: { length_mm: 2400, width_mm: 150, thickness_mm: 25 },
      knots: [
        {
          id: "sm-k1",
          surface: "front",
          u: 0.50, v: 0.50,
          diameter_mm: 42, aspect_ratio: 3.5, rotation_deg: 0,
          shape: "oval", type: "dead", darkness: 0.86,
          tunnel: { exit_kind: "through", exit_diameter_mm: 38, exit_du: 0, exit_dv: 0, depth_factor: 0.5 },
        },
      ],
    },
  },

  {
    id: "splay-wide",
    label: "Splay Knot — Wide",
    shortLabel: "Splay (Wide)",
    description:
      "A wide splay knot where d_max spans most of the face width. d_max is " +
      "4–6× d_min. This is a significant defect: the knot weakens the cross-section " +
      "and often forces a Grade B or C assignment.",
    project: {
      dimensions: { length_mm: 2400, width_mm: 150, thickness_mm: 25 },
      knots: [
        {
          id: "sw-k1",
          surface: "front",
          u: 0.72, v: 0.50,
          diameter_mm: 65, aspect_ratio: 4.8, rotation_deg: 0,
          shape: "oval", type: "dead", darkness: 0.90,
          tunnel: { exit_kind: "through", exit_diameter_mm: 60, exit_du: 0, exit_dv: 0, depth_factor: 0.5 },
        },
      ],
    },
  },

  // ── Row 3: Spike knot (longitudinal) ────────────────────────────────────────

  {
    id: "spike-longitudinal",
    label: "Spike Knot",
    shortLabel: "Spike Knot",
    description:
      "A spike (grub) knot where the branch ran almost parallel to the board " +
      "length before being cut. d_max spans much of the board length; d_min is very " +
      "small. Rare but significant — often missed by visual inspection.",
    project: {
      dimensions: { length_mm: 2400, width_mm: 150, thickness_mm: 25 },
      knots: [
        {
          id: "sl-k1",
          surface: "front",
          u: 0.50, v: 0.38,
          diameter_mm: 45, aspect_ratio: 10, rotation_deg: 0,
          shape: "spike", type: "live", darkness: 0.87,
          tunnel: { exit_kind: "through", exit_diameter_mm: 42, exit_du: 0, exit_dv: 0, depth_factor: 0.5 },
        },
      ],
    },
  },

  // ── Row 4: Arris & edge knots ────────────────────────────────────────────────

  {
    id: "arris-single",
    label: "Arris Knot",
    shortLabel: "Arris Knot",
    description:
      "A knot centred on the arris (long-edge corner) of the board. It appears on " +
      "both the face and the adjacent edge surface as a roughly triangular shape. " +
      "d_min is the smaller of the two face measurements.",
    project: {
      dimensions: { length_mm: 2400, width_mm: 150, thickness_mm: 25 },
      knots: [
        {
          id: "ar-k1",
          surface: "front",
          u: 0.25, v: 0.03,
          diameter_mm: 65, aspect_ratio: 2.4, rotation_deg: 86,
          shape: "spike", type: "dead", darkness: 0.90,
        },
        {
          id: "ar-k2",
          surface: "top",
          u: 0.25, v: 0.52,
          diameter_mm: 18, aspect_ratio: 1.8, rotation_deg: 0,
          shape: "oval", type: "dead", darkness: 0.88,
        },
      ],
    },
  },

  {
    id: "arris-compound",
    label: "Compound Arris Knot",
    shortLabel: "Compound Arris",
    description:
      "Two adjacent arris knots meeting at the bottom edge, requiring separate " +
      "d_min1 and d_min2 measurements. The overall d_min is the smaller of the two. " +
      "Typical in boards with multiple closely spaced branches.",
    project: {
      dimensions: { length_mm: 2400, width_mm: 150, thickness_mm: 25 },
      knots: [
        // First arris at bottom
        {
          id: "ac-k1",
          surface: "front",
          u: 0.44, v: 0.97,
          diameter_mm: 60, aspect_ratio: 2.2, rotation_deg: -85,
          shape: "spike", type: "dead", darkness: 0.90,
        },
        {
          id: "ac-k2",
          surface: "bottom",
          u: 0.44, v: 0.48,
          diameter_mm: 18, aspect_ratio: 1.7, rotation_deg: 0,
          shape: "oval", type: "dead", darkness: 0.88,
        },
        // Second arris — kept close so both are visible in the cropped tile
        {
          id: "ac-k3",
          surface: "front",
          u: 0.52, v: 0.97,
          diameter_mm: 52, aspect_ratio: 1.9, rotation_deg: -82,
          shape: "spike", type: "dead", darkness: 0.88,
        },
        {
          id: "ac-k4",
          surface: "bottom",
          u: 0.52, v: 0.52,
          diameter_mm: 16, aspect_ratio: 1.5, rotation_deg: 0,
          shape: "oval", type: "dead", darkness: 0.85,
        },
      ],
    },
  },

];

// ── Row groupings for the interactive diagram ────────────────────────────────

export const DIAGRAM_ROWS: DiagramRow[] = [
  {
    label: "Face & Edge Spike Knots",
    subtitle: "Knots visible on the broad face or at the long edge of the board.",
    caseIds: ["face-spike", "arris-spike", "edge-spike"],
  },
  {
    label: "Splay Knots",
    subtitle: "Branch cut the face at a shallow angle — wide, flat ellipse. Three size grades.",
    caseIds: ["splay-narrow", "splay-medium", "splay-wide"],
  },
  {
    label: "Spike Knot",
    subtitle: "Branch ran almost parallel to the length of the board.",
    caseIds: ["spike-longitudinal"],
  },
  {
    label: "Arris & Edge Knots",
    subtitle: "Knots crossing the long or corner edge — visible on two or more surfaces.",
    caseIds: ["arris-single", "arris-compound"],
  },
];
