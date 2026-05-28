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

Surfaces:
  - front  (length × width) — primary broad face, top of the board as it lies flat
  - back   (length × width) — opposite broad face; mirror of front across the
                              thickness axis. A knot at u=X on the front pairs
                              with a knot at u=(1000 - X) on the back, same v.
  - top    (length × thickness) — long thin edge along one long side
  - bottom (length × thickness) — opposite long edge; mirror of top across width
  - left   (width × thickness) — short end-grain face on one end
  - right  (width × thickness) — opposite short end-grain face; mirror of left across length

Return STRICT JSON matching the provided schema. No prose, no markdown.

DETECTION
For each surface, find every visible knot. For each knot:
  - id: integer starting at 0, unique within that surface
  - bbox: [ymin, xmin, ymax, xmax] normalized to 0-1000 on THAT surface
  - type: "live" | "dead" | "knot_hole"  (definitions identical to the 2-face flow)
  - diameter_estimate_mm: integer, in millimeters using that surface's true dimensions
  - confidence: 0.0–1.0

PAIRING (through-knots — the critical step)
A through-knot is one branch passing through the plank from one face to the
face directly opposite. Pairs are ONLY valid between opposite faces:
  - front ↔ back
  - top ↔ bottom
  - left ↔ right
Diagonal pairs (e.g. front↔top) are NEVER valid — report them as separate knots.

To pair two opposite-face knots:
  1. Mirror one knot's u coordinate: u' = 1000 - u. Match knots whose mirrored
     u is within ~120 units and whose v is within ~120 units.
  2. Diameters should match within ~35%.
  3. Type may differ across faces (a live knot on one side often becomes a
     dead knot or hole on the other).
Return pairs as an array of:
  { "a": {"surface": "<front|back|top|bottom|left|right>", "id": <int>},
    "b": {"surface": "<opposite>", "id": <int>},
    "confidence": 0..1 }
Unmatched knots do NOT appear in pairs. Conservative pairing is preferred —
a wrong pair is worse than a missed pair.

GRADING
  - total_knots: count across all 6 surfaces
  - through_knot_count: length of pairs array
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
        },
        required: ["a", "b", "confidence"],
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
