# KnotScope

A web app for lumber graders. Upload two photos of the same wooden board (front face and back face), and the app uses Gemini Flash 3.5 to detect knots on each face, then pair the knots that pass through the board (the same branch visible on both sides), compute a structural grade, and produce an exportable PDF report.

This approach replaces the two custom-trained models (YOLOv8 detector + triplet pairing network) from [arXiv 2505.05845](https://arxiv.org/abs/2505.05845) with a single multimodal LLM call.

## Architecture

```
Browser                     Next.js Server              Gemini API
  │                              │                            │
  │  POST /api/analyze           │                            │
  │  { frontImage, backImage }   │                            │
  │──────────────────────────────▶                            │
  │                              │  generateContent()         │
  │                              │───────────────────────────▶│
  │                              │    responseSchema (JSON)   │
  │                              │◀───────────────────────────│
  │                              │  Zod.parse()               │
  │       Analysis JSON          │                            │
  │◀─────────────────────────────│                            │
  │                              │
  │  POST /api/report            │
  │  { analysis, images }        │
  │──────────────────────────────▶
  │                              │  @react-pdf/renderer
  │       PDF binary             │
  │◀─────────────────────────────│
```

**Key files:**
- `lib/gemini.ts` — Gemini call with structured output and tuned prompt
- `lib/schema.ts` — Zod schema for `Knot` and `Analysis`
- `lib/bbox.ts` — coordinate conversion: Gemini `[ymin, xmin, ymax, xmax]` → pixel rect
- `components/AnalysisCanvas.tsx` — image + canvas knot overlay
- `app/page.tsx` — three-state UI (upload → loading → results)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Set environment variables

```bash
cp .env.local.example .env.local
# Edit .env.local and add your GEMINI_API_KEY
# Get a key at https://aistudio.google.com/app/apikey
```

### 3. Download sample images (optional)

```bash
npx ts-node scripts/fetch-samples.ts
```

### 4. Run the dev server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### 5. Run unit tests

```bash
npm test
```

## Deploy to Vercel

```bash
vercel link && vercel --prod
```

Set `GEMINI_API_KEY` in your Vercel project's environment variables.

## Limitations

- **Sample images are not true front/back pairs.** The script downloads wood-knot images from Wikimedia Commons for demonstration, but these are not actual flipped photographs of the same board. For genuine through-knot detection and pairing, upload real photos taken by flipping the board.
- **Pairing accuracy depends on photo alignment.** If the two photos are taken from very different angles or distances, pairing confidence will be lower.
- **Occasional false positives on grain figure.** Dramatic grain patterns can be mistaken for dead knots. The confidence score helps filter these.
- **Diameter estimates are approximate.** The model assumes a ~150 mm board face width unless the image clearly suggests otherwise.

## Credits

- Knot detection approach inspired by [arXiv 2505.05845](https://arxiv.org/abs/2505.05845)
- Powered by [Gemini Flash](https://deepmind.google/technologies/gemini/) via the `@google/genai` SDK
- UI: [Next.js](https://nextjs.org), [Tailwind CSS](https://tailwindcss.com), [shadcn/ui](https://ui.shadcn.com)
- PDF export: [@react-pdf/renderer](https://react-pdf.org)
- Contributors: RextonWong, yongsonmckl
