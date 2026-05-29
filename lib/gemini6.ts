import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { Analysis6Schema } from "./schema";
import type { PlankDimensions } from "./plank";
import type { RenderedSurface } from "./renderSurface";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const PROMPT_TEMPLATE = (dims: PlankDimensions) => `You are an expert lumber grader analyzing six photographs of the SAME wooden
plank: the six surfaces in 3D space. The plank has these physical dimensions:
  - length:    ${dims.length_mm} mm
  - width:     ${dims.width_mm} mm
  - thickness: ${dims.thickness_mm} mm

Surfaces (u is the long axis of each surface, v is the short axis):
  - front  (length × width)    — primary broad face, top of the board as it lies flat
  - back   (length × width)    — opposite broad face; mirror of front along u (board flipped about its long axis)
  - top    (length × thickness) — long thin edge along one long side
  - bottom (length × thickness) — opposite long edge; mirror of top along v (board flipped about its long axis)
  - left   (width × thickness) — short end-grain face on one end
  - right  (width × thickness) — opposite end-grain face; mirror of left along u (board flipped about its width axis)

Return STRICT JSON matching the provided schema. No prose, no markdown.

DETECTION
For each surface, find every visible knot. For each knot:
  - id: integer starting at 0, unique within that surface
  - bbox: [ymin, xmin, ymax, xmax] normalized to 0-1000 on THAT surface
  - type: "live" | "dead" | "knot_hole"
      live      — intergrown, intact, often with a darker rim, structurally sound
      dead      — loose or encased, dark ring or gap around it, may fall out
      knot_hole — missing wood, visible cavity / hole through the surface
  - diameter_estimate_mm: integer, in millimeters using that surface's true dimensions
  - confidence: 0.0–1.0

PAIRING — two valid kinds, always conservative
Two kinds of branch pairs are detectable. Both use the same pair schema;
set the "kind" field accordingly.

────────────────────────────────────────────────────
KIND "through" — branch passes fully through the plank
────────────────────────────────────────────────────
Valid ONLY between OPPOSITE faces:
  front ↔ back  |  top ↔ bottom  |  left ↔ right

Mirror rules (u/v in 0-1000 space):
  front ↔ back   : u flips (|u_a + u_b − 1000| ≲ 120), v preserved (|v_a − v_b| ≲ 120)
  top   ↔ bottom : u preserved (|u_a − u_b| ≲ 120), v flips (|v_a + v_b − 1000| ≲ 120)
  left  ↔ right  : u flips (|u_a + u_b − 1000| ≲ 120), v preserved (|v_a − v_b| ≲ 120)
Diameters within ~35%. Type may differ.

────────────────────────────────────────────────────
KIND "arris" — branch exits through a long edge or end corner
────────────────────────────────────────────────────
An arris knot is visible on TWO ADJACENT surfaces that share a physical edge of
the board. On BOTH surfaces the knot must sit AT that shared edge — within 200
units of the relevant boundary (v=0, v=1000, u=0, or u=1000).

Valid adjacent pairs and edge-proximity rules:

Long arris (broad face ↔ narrow long edge):
  front ↔ top    : front.v < 200 (top edge)    AND top.v   > 800 (front side) AND |Δu| < 150
  front ↔ bottom : front.v > 800 (bottom edge) AND bottom.v < 200 (front side) AND |Δu| < 150
  back  ↔ top    : back.v  < 200 (top edge)    AND top.v   < 200 (back side)  AND |u_back + u_top − 1000| < 150
  back  ↔ bottom : back.v  > 800 (bottom edge) AND bottom.v > 800 (back side)  AND |u_back + u_bottom − 1000| < 150

Short-end arris (any face ↔ end-grain face):
  front ↔ left  : front.u < 200  AND left.v  < 200  (left end, front side)
  front ↔ right : front.u > 800  AND right.v < 200  (right end, front side)
  back  ↔ left  : back.u  > 800  AND left.v  < 200  (back u is flipped)
  back  ↔ right : back.u  < 200  AND right.v < 200
  top   ↔ left  : top.u   < 200  AND left.u  < 200  (top-left corner)
  top   ↔ right : top.u   > 800  AND right.u > 800  (top-right corner)
  bottom↔ left  : bottom.u < 200 AND left.u  < 200  (bottom-left corner)
  bottom↔ right : bottom.u > 800 AND right.u > 800  (bottom-right corner)

For arris pairs the knot size on the narrower surface is typically smaller;
diameters need only match within ~50%.

Unmatched knots do NOT appear in pairs.
Conservative pairing is always preferred — a wrong pair is worse than a missed one.

GRADING
  - total_knots: count across all 6 surfaces
  - through_knot_count: total number of pairs (both "through" and "arris" kinds)
  - max_knot_diameter_mm: largest single knot across all surfaces
  - estimated_grade:
      "Select": fewer than 3 small knots (<20mm), no dead, no holes
      "A": no dead knots over 30mm, total knot area under 10% of total face area
      "B": some defects but structurally sound for general construction
      "C": large dead knots or holes — decorative / non-structural only
      "Reject": severe defects, splits, or knot area over 25%
  - reasoning: 1 short sentence summary (will be shown as a headline)

DETAILED ANALYSIS — required, must be substantive
Produce a multi-section technical report. Every section must be SPECIFIC and
reference actual measurements, knot IDs, and surface names from your detection
output above. Generic statements like "the board has some knots" are NOT acceptable.

  - overall (2-4 sentences): Comprehensive condition summary. Include total knot
    count, through-knot count, surface coverage (which faces have knots), worst
    defect (cite specific knot ID, surface, type, diameter), and what immediately
    stands out about this plank.

  - notable_defects (array of 1-6 bullet strings): Call out specific high-impact
    knots/holes individually. Format each bullet as:
      "Knot #<id> on the <surface> face — <type> <diameter>mm — <one-line reason it matters>"
    Examples:
      "Knot #2 on the front face — dead 38mm — exceeds 30mm threshold, precludes Grade A."
      "Knot-hole #0 on the top edge — 22mm through-hole paired with back #3, weakens cross-section."
    If there are zero meaningful defects, return a single bullet stating so.

  - through_knot_discussion (2-4 sentences): How many through-knots were detected
    and on which axis (thickness, width, length). Are they clustered or scattered?
    Cite the specific pair IDs and surfaces (e.g., "front #1 ↔ back #2"). Discuss
    what the through-knot pattern means structurally — through-knots reduce
    cross-sectional strength more than surface knots.

  - grade_criteria_applied (3-5 sentences): Explain in plain language which
    criteria from the grading rubric led to the chosen grade. Reference the
    specific quantitative thresholds and the actual measured values. e.g.,
    "Grade A requires no dead knot exceeding 30mm; the largest dead knot found is
    knot #2 at 38mm on the front face, which exceeds the threshold — therefore
    Grade B is the highest grade possible. Grade C was not assigned because no
    knot-holes were detected and dead-knot total area is below the C threshold."

  - structural_assessment (2-3 sentences): Discuss load-bearing implications,
    moisture/decay risk if any knot type suggests it, and weakest cross-section
    location (e.g., "the plank's weakest cross-section is at length ~40% where
    knots cluster on both broad faces").

  - recommendations (2-3 sentences): Specific use-case suggestions matching
    the grade — e.g., "Suitable for general framing studs and joists but not
    for visible cabinet faces. Avoid use as a beam under heavy load."

VALIDITY
Set is_lumber to true only if ALL six images clearly show wooden plank surfaces.
If any surface is not wood (e.g. a person, food, paper, abstract pattern), set
is_lumber to false and return empty arrays for every surface, empty pairs,
zeroed numeric fields, estimated_grade "Reject", and put a one-line note in
detailed_analysis.overall explaining what was wrong.`;

const knotItemSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.INTEGER },
    bbox: {
      type: Type.ARRAY,
      items: { type: Type.NUMBER },
    },
    type: { type: Type.STRING, enum: ["live", "dead", "knot_hole"] },
    diameter_estimate_mm: { type: Type.INTEGER },
    confidence: { type: Type.NUMBER },
  },
  required: ["id", "bbox", "type", "diameter_estimate_mm", "confidence"],
};

const pairRefSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    surface: {
      type: Type.STRING,
      enum: ["front", "back", "top", "bottom", "left", "right"],
    },
    id: { type: Type.INTEGER },
  },
  required: ["surface", "id"],
};

const GEMINI6_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    is_lumber: { type: Type.BOOLEAN },
    surfaces: {
      type: Type.OBJECT,
      properties: {
        front: { type: Type.ARRAY, items: knotItemSchema },
        back: { type: Type.ARRAY, items: knotItemSchema },
        top: { type: Type.ARRAY, items: knotItemSchema },
        bottom: { type: Type.ARRAY, items: knotItemSchema },
        left: { type: Type.ARRAY, items: knotItemSchema },
        right: { type: Type.ARRAY, items: knotItemSchema },
      },
      required: ["front", "back", "top", "bottom", "left", "right"],
    },
    pairs: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          a: pairRefSchema,
          b: pairRefSchema,
          confidence: { type: Type.NUMBER },
          kind: { type: Type.STRING, enum: ["through", "arris"] },
        },
        required: ["a", "b", "confidence", "kind"],
      },
    },
    total_knots: { type: Type.INTEGER },
    through_knot_count: { type: Type.INTEGER },
    max_knot_diameter_mm: { type: Type.INTEGER },
    estimated_grade: {
      type: Type.STRING,
      enum: ["Select", "A", "B", "C", "Reject"],
    },
    reasoning: { type: Type.STRING },
    detailed_analysis: {
      type: Type.OBJECT,
      properties: {
        overall: { type: Type.STRING },
        notable_defects: { type: Type.ARRAY, items: { type: Type.STRING } },
        through_knot_discussion: { type: Type.STRING },
        grade_criteria_applied: { type: Type.STRING },
        structural_assessment: { type: Type.STRING },
        recommendations: { type: Type.STRING },
      },
      required: [
        "overall",
        "notable_defects",
        "through_knot_discussion",
        "grade_criteria_applied",
        "structural_assessment",
        "recommendations",
      ],
    },
  },
  required: [
    "is_lumber",
    "surfaces",
    "pairs",
    "total_knots",
    "through_knot_count",
    "max_knot_diameter_mm",
    "estimated_grade",
    "reasoning",
    "detailed_analysis",
  ],
};

export interface SurfaceImageInput {
  base64: string;
  mime?: string;
}

export async function analyzePlank6(
  dims: PlankDimensions,
  surfaces: Record<"front" | "back" | "top" | "bottom" | "left" | "right", SurfaceImageInput>
) {
  const contents = [
    { text: PROMPT_TEMPLATE(dims) },
    ...(["front", "back", "top", "bottom", "left", "right"] as const).flatMap(
      (s) => [
        { text: `${s.toUpperCase()} SURFACE:` },
        {
          inlineData: {
            mimeType: surfaces[s].mime ?? "image/jpeg",
            data: surfaces[s].base64,
          },
        },
      ]
    ),
  ];

  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents,
    config: {
      responseMimeType: "application/json",
      responseSchema: GEMINI6_RESPONSE_SCHEMA,
      temperature: 0.2,
    },
  });

  const parsed = JSON.parse(response.text ?? "{}") as unknown;
  return Analysis6Schema.parse(parsed);
}

// Re-export for callers building the request directly from RenderedSurface objects
export function renderedToInput(r: RenderedSurface): SurfaceImageInput {
  return { base64: r.base64, mime: r.mime };
}
