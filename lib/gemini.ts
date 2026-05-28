import { GoogleGenAI, Type, type Schema } from "@google/genai";
import { AnalysisSchema } from "./schema";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });

const PROMPT = `You are an expert lumber grader analyzing two photographs of the SAME wooden
board: the front face and the back face. The board has been flipped over
between photos, so a knot at position X on the front may have a corresponding
knot at position (1000 - X) on the back — because branches pass through the
board's thickness.

Return STRICT JSON matching the provided schema. No prose, no markdown.

DETECTION
For each face, find every visible knot. For each knot:
- id: integer starting at 0, unique within that face
- bbox: [ymin, xmin, ymax, xmax] normalized to 0-1000 (your native format)
- type:
  - "live" — intergrown, intact, often with a darker rim, structurally sound
  - "dead" — loose or encased, dark ring or gap around it, may fall out
  - "knot_hole" — missing wood, hole present
- diameter_estimate_mm: integer, best estimate. Assume board face is ~150mm
  wide unless the image clearly suggests otherwise.
- confidence: 0.0-1.0

PAIRING (this is the critical step)
Knots correspond across faces when they are the same branch passing through.
To pair them:
1. Mentally mirror the back image horizontally. A knot at front x=300
   likely pairs with a back knot at x=700.
2. The y-coordinate should be roughly preserved (within ~100 units).
3. Diameters should match within ~30%.
4. Shape and type should be consistent (a live knot often becomes a dead
   knot or hole on the opposite side, so type can differ).

Return \`pairs\` as [[front_id, back_id, pair_confidence], ...].
Unmatched knots should NOT appear in pairs. Be conservative — a wrong
pairing is worse than a missed one.

GRADING
- total_knots: count across both faces (sum, not unique branches)
- through_knot_count: length of pairs array
- max_knot_diameter_mm: largest single knot across both faces
- estimated_grade:
  - "Select": fewer than 3 small knots (<20mm), no dead knots, no holes
  - "A": no dead knots over 30mm, total knot area under 10% of face area
  - "B": some defects but structurally sound for general construction
  - "C": large dead knots or holes — decorative or non-structural use only
  - "Reject": severe defects, splits, or knot area over 25%
- reasoning: 1-2 sentences explaining the grade

VALIDITY
Set is_lumber to true only if BOTH images clearly show a wooden board or
lumber. If either image is not wood (e.g. a person, food, landscape, paper,
or any non-lumber subject), set is_lumber to false and return empty arrays
for front/back/pairs with zeroed numeric fields and estimated_grade "Reject".`;

const knotItemSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.INTEGER },
    bbox: {
      type: Type.ARRAY,
      items: { type: Type.NUMBER },
    },
    type: {
      type: Type.STRING,
      enum: ["live", "dead", "knot_hole"],
    },
    diameter_estimate_mm: { type: Type.INTEGER },
    confidence: { type: Type.NUMBER },
  },
  required: ["id", "bbox", "type", "diameter_estimate_mm", "confidence"],
};

const GEMINI_RESPONSE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    is_lumber: { type: Type.BOOLEAN },
    front: { type: Type.ARRAY, items: knotItemSchema },
    back: { type: Type.ARRAY, items: knotItemSchema },
    pairs: {
      type: Type.ARRAY,
      items: {
        type: Type.ARRAY,
        items: { type: Type.NUMBER },
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
  },
  required: [
    "is_lumber",
    "front",
    "back",
    "pairs",
    "total_knots",
    "through_knot_count",
    "max_knot_diameter_mm",
    "estimated_grade",
    "reasoning",
  ],
};

export async function analyzeBoard(frontB64: string, backB64: string) {
  const response = await ai.models.generateContent({
    model: "gemini-3.5-flash",
    contents: [
      { text: PROMPT },
      { text: "FRONT FACE:" },
      { inlineData: { mimeType: "image/jpeg", data: frontB64 } },
      { text: "BACK FACE:" },
      { inlineData: { mimeType: "image/jpeg", data: backB64 } },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: GEMINI_RESPONSE_SCHEMA,
      temperature: 0.2,
    },
  });
  const parsed = JSON.parse(response.text ?? "{}") as unknown;
  return AnalysisSchema.parse(parsed);
}
