import { z } from "zod";
import { SurfaceIdSchema } from "./plank";

export const KnotSchema = z.object({
  id: z.number().int(),
  // [ymin, xmin, ymax, xmax] normalized 0-1000 (Gemini native format)
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  type: z.enum(["live", "dead", "knot_hole"]),
  diameter_estimate_mm: z.number().int(),
  confidence: z.number().min(0).max(1),
});

export const AnalysisSchema = z.object({
  is_lumber: z.boolean(),
  front: z.array(KnotSchema),
  back: z.array(KnotSchema),
  pairs: z.array(z.tuple([z.number(), z.number(), z.number()])),
  total_knots: z.number().int(),
  through_knot_count: z.number().int(),
  max_knot_diameter_mm: z.number().int(),
  estimated_grade: z.enum(["Select", "A", "B", "C", "Reject"]),
  reasoning: z.string(),
});

export type Knot = z.infer<typeof KnotSchema>;
export type Analysis = z.infer<typeof AnalysisSchema>;

// ── 6-surface analysis schema ────────────────────────────────────────────────

export const SurfaceKnotsSchema = z.object({
  front: z.array(KnotSchema),
  back: z.array(KnotSchema),
  top: z.array(KnotSchema),
  bottom: z.array(KnotSchema),
  left: z.array(KnotSchema),
  right: z.array(KnotSchema),
});

export const PairRefSchema = z.object({
  surface: SurfaceIdSchema,
  id: z.number().int(),
});

export const Pair6Schema = z.object({
  a: PairRefSchema,
  b: PairRefSchema,
  confidence: z.number().min(0).max(1),
  // "through" = branch passes fully through opposite faces (front↔back etc.)
  // "arris"   = branch exits through a long edge or end corner (front↔top etc.)
  kind: z.enum(["through", "arris"]).optional().default("through"),
});

export const DetailedAnalysisSchema = z.object({
  overall: z.string(),
  notable_defects: z.array(z.string()),
  through_knot_discussion: z.string(),
  grade_criteria_applied: z.string(),
  structural_assessment: z.string(),
  recommendations: z.string(),
});

export const Analysis6Schema = z.object({
  is_lumber: z.boolean(),
  surfaces: SurfaceKnotsSchema,
  pairs: z.array(Pair6Schema),
  total_knots: z.number().int(),
  through_knot_count: z.number().int(),
  max_knot_diameter_mm: z.number().int(),
  estimated_grade: z.enum(["Select", "A", "B", "C", "Reject"]),
  reasoning: z.string(),
  detailed_analysis: DetailedAnalysisSchema,
});

export type DetailedAnalysis = z.infer<typeof DetailedAnalysisSchema>;

export type SurfaceKnots = z.infer<typeof SurfaceKnotsSchema>;
export type Pair6 = z.infer<typeof Pair6Schema>;
export type Analysis6 = z.infer<typeof Analysis6Schema>;
