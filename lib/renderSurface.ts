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

// Tuned to look like photographed pine / oak board planks under warm light.
// Each surface gets a slightly different palette so Gemini can distinguish
// face vs edge vs end-grain even when they share noise seeds.
const PALETTES: Record<SurfaceId, Palette> = {
  front:  { base: [178, 132,  82], dark: [ 82,  48,  22], light: [221, 184, 134], seedSalt: 11 },
  back:   { base: [180, 134,  84], dark: [ 84,  50,  24], light: [223, 186, 136], seedSalt: 22 },
  top:    { base: [168, 120,  74], dark: [ 70,  40,  18], light: [206, 162, 112], seedSalt: 33 },
  bottom: { base: [170, 122,  76], dark: [ 72,  42,  20], light: [208, 164, 114], seedSalt: 44 },
  left:   { base: [196, 154, 104], dark: [110,  72,  40], light: [228, 192, 144], seedSalt: 55 },
  right:  { base: [196, 154, 104], dark: [110,  72,  40], light: [228, 192, 144], seedSalt: 66 },
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
  pxPerMm?: number;     // default 6
  maxEdgePx?: number;   // default 1280
  jpegQuality?: number; // default 0.88
}

function pickSize(
  width_mm: number,
  height_mm: number,
  opts: RenderOpts
): { wPx: number; hPx: number; scale: number } {
  const target = opts.pxPerMm ?? 6;
  const maxEdge = opts.maxEdgePx ?? 1280;
  // Also enforce a sensible minimum for very thin edges so they stay legible.
  const minShort = 96;
  let wPx = Math.round(width_mm * target);
  let hPx = Math.round(height_mm * target);
  const longest = Math.max(wPx, hPx);
  if (longest > maxEdge) {
    const s = maxEdge / longest;
    wPx = Math.round(wPx * s);
    hPx = Math.round(hPx * s);
  }
  // Bump up the short edge so very flat surfaces still have visible texture.
  if (wPx < hPx) {
    if (wPx < minShort) {
      const s = minShort / wPx;
      wPx = minShort;
      hPx = Math.round(hPx * s);
    }
  } else {
    if (hPx < minShort) {
      const s = minShort / hPx;
      hPx = minShort;
      wPx = Math.round(wPx * s);
    }
  }
  const scale = wPx / width_mm;
  return { wPx, hPx, scale };
}

// Paint a photorealistic wood-grain background covering the whole canvas.
//
// Approach:
//   1. Decide grain direction (always along the surface's long axis).
//   2. Pick ring spacing so we see ~6–10 rings across the short axis —
//      this is what real boards look like at typical face widths.
//   3. Compute a "band position" with low-frequency noise wobble, then map
//      the fractional part to a band profile: wide soft light early-wood +
//      narrow sharp dark late-wood. This is how real growth rings appear.
//   4. Add a SLOW color variation field so different regions of the board
//      lean lighter or darker overall.
//   5. Add medullary rays (perpendicular short streaks) and per-pixel grit.
function paintWood(
  ctx: CanvasRenderingContext2D,
  surface: SurfaceId,
  wPx: number,
  hPx: number
): void {
  const palette = PALETTES[surface];
  const isEndGrain = surface === "left" || surface === "right";
  const longAxisIsX = wPx >= hPx;

  const baseSeed = palette.seedSalt;
  const nGrain = makeNoise(baseSeed * 1009);
  const nFine = makeNoise(baseSeed * 7919);
  const nWarp = makeNoise(baseSeed * 401);
  const nColor = makeNoise(baseSeed * 137);

  const shortAxisPx = Math.min(wPx, hPx);
  // 7 ± 2 visible rings across the short axis — natural for boards
  const ringCount = 7 + (baseSeed % 5);
  const ringSpacingPx = shortAxisPx / ringCount;

  const img = ctx.createImageData(wPx, hPx);
  const data = img.data;

  // For end-grain surfaces (the short sawn ends), the rings form arcs around
  // a slightly off-center pith point. Place the pith outside the visible
  // area for plank-style "tangential" rings.
  const pithCx = wPx * (0.5 - 0.6);
  const pithCy = hPx * (0.5 + 0.3);

  for (let y = 0; y < hPx; y++) {
    for (let x = 0; x < wPx; x++) {
      // Subtle warp so grain lines aren't dead-straight
      const wx = fbm(nWarp, x / 90, y / 220, 3) * ringSpacingPx * 0.45;
      const wy = fbm(nWarp, x / 220, y / 90, 3) * ringSpacingPx * 0.15;

      let bandPos: number;
      if (isEndGrain) {
        const dxp = x - pithCx + wx;
        const dyp = y - pithCy + wy;
        const r = Math.sqrt(dxp * dxp + dyp * dyp);
        bandPos = r / (ringSpacingPx * 0.85);
      } else {
        const acrossAxis = longAxisIsX ? y + wy : x + wx;
        bandPos = acrossAxis / ringSpacingPx;
      }

      // Phase within the current ring [0..1)
      const phase = bandPos - Math.floor(bandPos);

      // Band profile: light early-wood for ~75% of the cycle, dark late-wood
      // packed into the last ~25%. The dark region has a sharper falloff so
      // it reads as a crisp growth-ring line.
      let t: number;
      if (phase < 0.78) {
        // Gentle gradient from base ↑ to light ↑ then back ↓ to base
        const p = phase / 0.78;
        t = 0.40 + 0.30 * Math.sin(p * Math.PI);
      } else {
        // Dark late-wood
        const p = (phase - 0.78) / 0.22; // 0..1
        // Triangle, sharper toward middle of the dark stripe
        const tri = 1 - Math.abs(p - 0.5) * 2;
        t = 0.08 + 0.18 * (1 - Math.pow(tri, 0.6));
      }

      // Slow color variation — gives the board a non-uniform overall hue
      const colorVar = fbm(nColor, x / 280, y / 280, 3) * 0.18;
      t = Math.max(0, Math.min(1, t + colorVar));

      // Mix the palette
      let col: [number, number, number];
      if (t < 0.38) {
        col = mixRgb(palette.dark, palette.base, t / 0.38);
      } else if (t < 0.78) {
        col = mixRgb(palette.base, palette.light, (t - 0.38) / 0.40);
      } else {
        // Past "max light" — pull back toward base so the brightest pixels
        // don't blow out
        col = mixRgb(palette.light, palette.base, (t - 0.78) / 0.22 * 0.4);
      }

      // Subtle multiplicative noise so flat areas have texture
      const grit = fbm(nFine, x / 1.4, y / 1.4, 1);
      const gritFac = 1 + grit * 0.06;
      col[0] *= gritFac;
      col[1] *= gritFac;
      col[2] *= gritFac;

      // Mild edge darkening so the board reads as a 3D object
      const vx = Math.min(x, wPx - x) / wPx;
      const vy = Math.min(y, hPx - y) / hPx;
      const vig = 1 - Math.min(1, Math.min(vx, vy) * 12) * 0.04;
      col[0] *= vig;
      col[1] *= vig;
      col[2] *= vig;

      const i = (y * wPx + x) * 4;
      data[i] = Math.max(0, Math.min(255, col[0]));
      data[i + 1] = Math.max(0, Math.min(255, col[1]));
      data[i + 2] = Math.max(0, Math.min(255, col[2]));
      data[i + 3] = 255;
    }
  }

  ctx.putImageData(img, 0, 0);

  // ── Post-pass: medullary rays + fine flecks (long faces only) ────────────
  if (!isEndGrain) {
    const rng = mulberry32(baseSeed * 31);
    ctx.save();
    // Medullary rays: short streaks perpendicular to grain
    ctx.strokeStyle = "rgba(40, 24, 12, 0.10)";
    ctx.lineCap = "round";
    const rayCount = 18 + Math.floor(rng() * 18);
    for (let i = 0; i < rayCount; i++) {
      const px = rng() * wPx;
      const py = rng() * hPx;
      const len = 6 + rng() * 30;
      const baseAng = longAxisIsX ? Math.PI / 2 : 0;
      const ang = baseAng + (rng() - 0.5) * 0.5;
      ctx.lineWidth = 0.5 + rng() * 0.8;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len);
      ctx.stroke();
    }
    // A few darker flecks for character
    ctx.fillStyle = "rgba(50, 28, 14, 0.18)";
    const fleckCount = 10 + Math.floor(rng() * 12);
    for (let i = 0; i < fleckCount; i++) {
      const px = rng() * wPx;
      const py = rng() * hPx;
      const r = 0.6 + rng() * 1.6;
      ctx.beginPath();
      ctx.ellipse(px, py, r * 2, r * 0.7, longAxisIsX ? 0 : Math.PI / 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
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
  const { wPx, hPx } = pickSize(s.width_mm, s.height_mm, opts);

  const canvas =
    typeof document !== "undefined"
      ? document.createElement("canvas")
      : ({ width: wPx, height: hPx } as HTMLCanvasElement);
  canvas.width = wPx;
  canvas.height = hPx;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D context unavailable");

  paintWood(ctx, surface, wPx, hPx);

  // Paint only the knots that belong to this surface
  const mine = knots.filter((k) => k.surface === surface);
  for (const k of mine) {
    paintKnot(ctx, k, surface, dims, wPx, hPx);
  }

  const dataUrl = canvas.toDataURL("image/jpeg", opts.jpegQuality ?? 0.88);
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
