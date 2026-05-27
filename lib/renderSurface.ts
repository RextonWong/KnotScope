import type {
  EditableKnot,
  KnotShape,
  KnotType,
  PlankDimensions,
  SurfaceId,
} from "./plank";
import { getSurfaceSize } from "./plank";

// ── Deterministic hashing for stable randomness across renders ──────────────

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h * 16777619) >>> 0;
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Value-noise (cheap perlin substitute) ────────────────────────────────────

interface NoiseGen {
  noise: (x: number, y: number) => number; // -> -1..1
}

function makeNoise(seed: number): NoiseGen {
  const rng = mulberry32(seed);
  const size = 256;
  const perm: number[] = [];
  for (let i = 0; i < size; i++) perm.push(Math.floor(rng() * size));

  const grad = (ix: number, iy: number) => {
    const idx = perm[(ix + perm[iy & (size - 1)]) & (size - 1)];
    return (idx / size) * 2 - 1;
  };
  const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

  return {
    noise: (x, y) => {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const xf = x - xi;
      const yf = y - yi;
      const u = fade(xf);
      const v = fade(yf);
      const a = grad(xi, yi);
      const b = grad(xi + 1, yi);
      const c = grad(xi, yi + 1);
      const d = grad(xi + 1, yi + 1);
      return lerp(lerp(a, b, u), lerp(c, d, u), v);
    },
  };
}

function fbm(n: NoiseGen, x: number, y: number, octaves: number): number {
  let sum = 0;
  let amp = 1;
  let freq = 1;
  let max = 0;
  for (let i = 0; i < octaves; i++) {
    sum += n.noise(x * freq, y * freq) * amp;
    max += amp;
    amp *= 0.5;
    freq *= 2;
  }
  return sum / max;
}

// ── Wood palette per surface ─────────────────────────────────────────────────
// Each surface type gets a slightly different palette so the model gets a
// stronger spatial signal about which face is which.

interface Palette {
  base: [number, number, number];   // average wood color
  dark: [number, number, number];   // grain low-band
  light: [number, number, number];  // grain high-band
  seedSalt: number;
}

const PALETTES: Record<SurfaceId, Palette> = {
  front:  { base: [190, 145,  98], dark: [128,  84,  46], light: [218, 178, 130], seedSalt: 11 },
  back:   { base: [188, 142,  96], dark: [126,  82,  44], light: [216, 176, 128], seedSalt: 22 },
  top:    { base: [176, 128,  82], dark: [112,  72,  38], light: [206, 162, 116], seedSalt: 33 },
  bottom: { base: [178, 130,  84], dark: [114,  74,  40], light: [208, 164, 118], seedSalt: 44 },
  left:   { base: [196, 152, 104], dark: [134,  90,  52], light: [222, 184, 138], seedSalt: 55 },
  right:  { base: [196, 152, 104], dark: [134,  90,  52], light: [222, 184, 138], seedSalt: 66 },
};

function mixRgb(
  a: [number, number, number],
  b: [number, number, number],
  t: number
): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function rgbStr([r, g, b]: [number, number, number]): string {
  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)})`;
}

// ── Wood grain renderer ──────────────────────────────────────────────────────

interface RenderOpts {
  pxPerMm?: number; // default 4
  maxEdgePx?: number; // default 1024
  jpegQuality?: number; // default 0.85
}

function pickSize(
  width_mm: number,
  height_mm: number,
  opts: RenderOpts
): { wPx: number; hPx: number; scale: number } {
  const target = opts.pxPerMm ?? 4;
  const maxEdge = opts.maxEdgePx ?? 1024;
  let wPx = Math.round(width_mm * target);
  let hPx = Math.round(height_mm * target);
  const longest = Math.max(wPx, hPx);
  if (longest > maxEdge) {
    const s = maxEdge / longest;
    wPx = Math.round(wPx * s);
    hPx = Math.round(hPx * s);
  }
  // Effective px-per-mm after capping
  const scale = wPx / width_mm;
  return { wPx, hPx, scale };
}

// Paint a wood-grain background covering the whole canvas.
function paintWood(
  ctx: CanvasRenderingContext2D,
  surface: SurfaceId,
  wPx: number,
  hPx: number,
  scale_pxPerMm: number
): void {
  const palette = PALETTES[surface];
  const isEndGrain = surface === "left" || surface === "right";

  const baseSeed = palette.seedSalt;
  const noiseGrain = makeNoise(baseSeed * 1009);
  const noiseFine = makeNoise(baseSeed * 7919);

  const img = ctx.createImageData(wPx, hPx);
  const data = img.data;

  // Grain frequency: how many rings per inch ~= every 5–8 mm a band
  const grainPeriodMm = 6;
  const grainFreq = (2 * Math.PI) / (grainPeriodMm * scale_pxPerMm);

  for (let y = 0; y < hPx; y++) {
    for (let x = 0; x < wPx; x++) {
      // Distort the coord with low-freq noise so grain lines wave realistically
      const dx = fbm(noiseGrain, x / 80, y / 600, 3) * 18;
      const dy = fbm(noiseGrain, x / 600, y / 80, 3) * 4;

      let t: number;
      if (isEndGrain) {
        // End grain: concentric rings centered roughly on the cross-section
        const cx = wPx / 2;
        const cy = hPx * 0.4;
        const r = Math.sqrt((x - cx) * (x - cx) + (y - cy) * (y - cy));
        // Add radial wobble
        const wob = fbm(noiseGrain, x / 50, y / 50, 3) * 8;
        t = 0.5 + 0.5 * Math.sin((r + wob) * grainFreq * 1.4);
      } else {
        // Long grain: bands running along the length (x axis)
        t = 0.5 + 0.5 * Math.sin((y + dy) * grainFreq + (x + dx) * grainFreq * 0.06);
      }

      // Sharpen the bands so they look more like rings, not a sine wave
      t = Math.pow(t, 1.8);

      // Mix dark→base→light along t with a small amount of noise jitter
      const fine = fbm(noiseFine, x / 12, y / 12, 4) * 0.1;
      const tt = Math.max(0, Math.min(1, t + fine * 0.3));
      let col: [number, number, number];
      if (tt < 0.5) col = mixRgb(palette.dark, palette.base, tt * 2);
      else col = mixRgb(palette.base, palette.light, (tt - 0.5) * 2);

      // Slight darkening towards edges (vignette)
      const vx = Math.min(x, wPx - x) / wPx;
      const vy = Math.min(y, hPx - y) / hPx;
      const vig = Math.min(1, Math.min(vx, vy) * 6);
      const vfac = 0.85 + 0.15 * vig;
      col[0] *= vfac;
      col[1] *= vfac;
      col[2] *= vfac;

      // Per-pixel noise grain
      const grit = fbm(noiseFine, x / 1.5, y / 1.5, 1) * 8;
      const i = (y * wPx + x) * 4;
      data[i] = Math.max(0, Math.min(255, col[0] + grit));
      data[i + 1] = Math.max(0, Math.min(255, col[1] + grit));
      data[i + 2] = Math.max(0, Math.min(255, col[2] + grit));
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);
}

// ── Knot painter ─────────────────────────────────────────────────────────────

// Sample the average wood color in a small patch around (cx, cy) so we can
// tint the knot toward something that blends with its surroundings.
function sampleSurround(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number
): [number, number, number] {
  const x0 = Math.max(0, Math.floor(cx - r));
  const y0 = Math.max(0, Math.floor(cy - r));
  const w = Math.min(ctx.canvas.width - x0, Math.ceil(r * 2));
  const h = Math.min(ctx.canvas.height - y0, Math.ceil(r * 2));
  if (w <= 0 || h <= 0) return [180, 130, 80];
  const data = ctx.getImageData(x0, y0, w, h).data;
  let R = 0, G = 0, B = 0, n = 0;
  for (let i = 0; i < data.length; i += 4) {
    R += data[i]; G += data[i + 1]; B += data[i + 2];
    n++;
  }
  return [R / n, G / n, B / n];
}

function knotTargetColor(
  type: KnotType,
  darkness: number,
  surround: [number, number, number]
): { core: string; rim: string } {
  // Darkness ∈ [0,1]; map to a multiplicative factor on the surround color
  // for the rim, and a sharper darker core.
  if (type === "knot_hole") {
    const coreFac = 0.10 + 0.05 * (1 - darkness);
    const rimFac = 0.35 + 0.10 * (1 - darkness);
    return {
      core: rgbStr([surround[0] * coreFac, surround[1] * coreFac, surround[2] * coreFac]),
      rim: rgbStr([surround[0] * rimFac, surround[1] * rimFac, surround[2] * rimFac]),
    };
  }
  if (type === "dead") {
    const coreFac = 0.35 - 0.20 * darkness;
    const rimFac = 0.22 - 0.10 * darkness;
    return {
      core: rgbStr([surround[0] * coreFac, surround[1] * coreFac, surround[2] * coreFac]),
      rim: rgbStr([surround[0] * rimFac, surround[1] * rimFac, surround[2] * rimFac]),
    };
  }
  // live
  const coreFac = 0.60 - 0.25 * darkness;
  const rimFac = 0.45 - 0.15 * darkness;
  return {
    core: rgbStr([surround[0] * coreFac, surround[1] * coreFac, surround[2] * coreFac]),
    rim: rgbStr([surround[0] * rimFac, surround[1] * rimFac, surround[2] * rimFac]),
  };
}

interface KnotShapePath {
  apply: (ctx: CanvasRenderingContext2D) => void;
}

function buildShapePath(
  shape: KnotShape,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rotation_deg: number,
  seed: number
): KnotShapePath {
  const rot = (rotation_deg * Math.PI) / 180;
  return {
    apply: (ctx) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);

      switch (shape) {
        case "circle":
          ctx.beginPath();
          ctx.arc(0, 0, Math.max(rx, ry), 0, Math.PI * 2);
          break;
        case "ellipse":
          ctx.beginPath();
          ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
          break;
        case "oval": {
          // Slightly squashed teardrop
          ctx.beginPath();
          ctx.ellipse(0, 0, rx * 1.2, ry * 0.85, 0, 0, Math.PI * 2);
          break;
        }
        case "spike": {
          // Long thin lens — like a tight pinched ellipse
          ctx.beginPath();
          ctx.ellipse(0, 0, rx * 1.6, ry * 0.4, 0, 0, Math.PI * 2);
          break;
        }
        case "irregular": {
          const rng = mulberry32(seed);
          const steps = 24;
          ctx.beginPath();
          for (let i = 0; i <= steps; i++) {
            const a = (i / steps) * Math.PI * 2;
            const wobble = 0.78 + rng() * 0.42;
            const px = Math.cos(a) * rx * wobble;
            const py = Math.sin(a) * ry * wobble;
            if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
          }
          ctx.closePath();
          break;
        }
      }
      ctx.restore();
    },
  };
}

function paintKnot(
  ctx: CanvasRenderingContext2D,
  knot: EditableKnot,
  surface: SurfaceId,
  dims: PlankDimensions,
  wPx: number,
  hPx: number
): void {
  const s = getSurfaceSize(surface, dims);
  const cx = knot.u * wPx;
  const cy = knot.v * hPx;
  const scale = wPx / s.width_mm;
  // Base radius in pixels — assume diameter is along the longer axis if elliptical
  const baseR = (knot.diameter_mm / 2) * scale;
  const ar = Math.max(0.3, Math.min(3, knot.aspect_ratio || 1));
  const rx = baseR * (ar >= 1 ? ar : 1);
  const ry = baseR * (ar >= 1 ? 1 : 1 / ar);
  if (baseR < 1) return;

  const seed = hashString(knot.id);
  const surround = sampleSurround(ctx, cx, cy, Math.max(rx, ry) * 1.3);
  const colors = knotTargetColor(knot.type, knot.darkness, surround);

  const path = buildShapePath(knot.shape, cx, cy, rx, ry, knot.rotation_deg, seed);

  // 1. Drop shadow (only for solid knot types — holes get an inverse highlight)
  ctx.save();
  if (knot.type === "knot_hole") {
    // Subtle bright rim around the hole (light catching the lip)
    ctx.shadowColor = "rgba(255, 240, 200, 0.35)";
    ctx.shadowBlur = Math.max(2, baseR * 0.25);
    ctx.shadowOffsetX = -1;
    ctx.shadowOffsetY = -1;
  } else {
    ctx.shadowColor = "rgba(0, 0, 0, 0.5)";
    ctx.shadowBlur = Math.max(2, baseR * 0.30);
    ctx.shadowOffsetX = baseR * 0.10;
    ctx.shadowOffsetY = baseR * 0.15;
  }
  ctx.fillStyle = colors.rim;
  path.apply(ctx);
  ctx.fill();
  ctx.restore();

  // 2. Radial gradient fill — direction depends on knot type
  ctx.save();
  let grad: CanvasGradient;
  if (knot.type === "knot_hole") {
    grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(rx, ry));
    grad.addColorStop(0, colors.core);
    grad.addColorStop(0.7, colors.core);
    grad.addColorStop(1, colors.rim);
  } else {
    // Live + dead knots: center is darker than the rim
    grad = ctx.createRadialGradient(
      cx - rx * 0.3, cy - ry * 0.3, 0, // off-center to suggest light source
      cx, cy, Math.max(rx, ry)
    );
    grad.addColorStop(0, colors.core);
    grad.addColorStop(0.55, colors.rim);
    // Blend slightly back toward surround at the very edge
    grad.addColorStop(1, rgbStr([
      surround[0] * 0.70,
      surround[1] * 0.65,
      surround[2] * 0.60,
    ]));
  }
  ctx.fillStyle = grad;
  path.apply(ctx);
  ctx.fill();
  ctx.restore();

  // 3. Internal grain rings (live/dead knots only)
  if (knot.type !== "knot_hole") {
    ctx.save();
    path.apply(ctx);
    ctx.clip();
    ctx.strokeStyle = `rgba(0, 0, 0, ${0.18 + 0.10 * knot.darkness})`;
    ctx.lineWidth = Math.max(0.7, baseR * 0.04);
    const rings = 2 + Math.floor(baseR / 6);
    for (let i = 1; i <= rings; i++) {
      const f = i / (rings + 1);
      ctx.beginPath();
      ctx.ellipse(
        cx - rx * 0.15 * (1 - f),
        cy - ry * 0.15 * (1 - f),
        rx * f,
        ry * f,
        (knot.rotation_deg * Math.PI) / 180,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  // 4. Crisp outline so the knot reads clearly
  ctx.save();
  ctx.lineWidth = Math.max(0.8, baseR * 0.06);
  ctx.strokeStyle = `rgba(20, 12, 6, ${knot.type === "knot_hole" ? 0.85 : 0.55})`;
  path.apply(ctx);
  ctx.stroke();
  ctx.restore();
}

// ── Public API ───────────────────────────────────────────────────────────────

export interface RenderedSurface {
  base64: string;
  mime: "image/jpeg";
  widthPx: number;
  heightPx: number;
}

export async function renderSurface(
  surface: SurfaceId,
  dims: PlankDimensions,
  knots: EditableKnot[],
  opts: RenderOpts = {}
): Promise<RenderedSurface> {
  const s = getSurfaceSize(surface, dims);
  const { wPx, hPx, scale } = pickSize(s.width_mm, s.height_mm, opts);

  const canvas =
    typeof document !== "undefined"
      ? document.createElement("canvas")
      : ({ width: wPx, height: hPx } as HTMLCanvasElement);
  canvas.width = wPx;
  canvas.height = hPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  paintWood(ctx, surface, wPx, hPx, scale);

  // Paint only the knots that belong to this surface
  const mine = knots.filter((k) => k.surface === surface);
  for (const k of mine) {
    paintKnot(ctx, k, surface, dims, wPx, hPx);
  }

  const dataUrl = canvas.toDataURL("image/jpeg", opts.jpegQuality ?? 0.85);
  const base64 = dataUrl.split(",")[1] ?? "";
  return { base64, mime: "image/jpeg", widthPx: wPx, heightPx: hPx };
}

export async function renderAllSurfaces(
  dims: PlankDimensions,
  knots: EditableKnot[],
  opts: RenderOpts = {}
): Promise<Record<SurfaceId, RenderedSurface>> {
  const surfaces: SurfaceId[] = ["front", "back", "top", "bottom", "left", "right"];
  const out = {} as Record<SurfaceId, RenderedSurface>;
  for (const s of surfaces) {
    out[s] = await renderSurface(s, dims, knots, opts);
  }
  return out;
}
