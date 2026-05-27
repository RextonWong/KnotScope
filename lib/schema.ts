import { z } from "zod";

export const KnotSchema = z.object({
  id: z.number().int(),
  // [ymin, xmin, ymax, xmax] normalized 0-1000 (Gemini native format)
  bbox: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  type: z.enum(["live", "dead", "knot_hole"]),
  diameter_estimate_mm: z.number().int(),
  confidence: z.number().min(0).max(1),
});

export const AnalysisSchema = z.object({
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
