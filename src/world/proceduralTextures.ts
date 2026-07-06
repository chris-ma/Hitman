import * as THREE from 'three';

/**
 * Small deterministic PRNG (mulberry32). Detail placement is derived from
 * building specs through this so the city looks identical on every load.
 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

function toTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Bump/height data is not color — no sRGB decode. */
function toBumpTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.anisotropy = 4;
  return tex;
}

/** rgb(g,g,g) helper for grayscale bump painting. */
function gray(g: number): string {
  const v = Math.max(0, Math.min(255, Math.round(g)));
  return `rgb(${v},${v},${v})`;
}

// ---------------------------------------------------------------------------
// Shared layout constants. Building.ts rebuilds the facade window grid in 3D
// (real glass panes) from these same fractions, so the painted texture and
// the glass geometry can never drift out of alignment.
// ---------------------------------------------------------------------------

/** Fraction of the facade texture height taken by the ground shopfront band. */
export const FACADE_GROUND_BAND_FRAC = 0.16;
/** Window left inset within its grid cell (fraction of cell width). */
export const WINDOW_X_FRAC = 0.26;
/** Window width (fraction of cell width). */
export const WINDOW_W_FRAC = 0.48;
/** Window top inset within its grid row (fraction of row height). */
export const WINDOW_Y_FRAC = 0.2;
/** Window height (fraction of row height). */
export const WINDOW_H_FRAC = 0.62;

/**
 * The four dusk gradient stops shared by the sky texture and the PMREM
 * environment (see world/Environment.ts): zenith → high sky → horizon glow →
 * horizon. Keeping them in one place stops reflections drifting from the sky.
 */
export const SKY_GRADIENT_STOPS: ReadonlyArray<readonly [number, string]> = [
  [0.0, '#2b3a63'],
  [0.45, '#6f5d7d'],
  [0.75, '#cf8a63'],
  [1.0, '#e8a06b'],
];

export interface FacadeTextures {
  map: THREE.CanvasTexture;
  emissiveMap: THREE.CanvasTexture;
  /** Grayscale relief correlated with the albedo: recessed windows, proud sills. */
  bumpMap: THREE.CanvasTexture;
}

/**
 * Haussmannian facade: dressed-limestone courses with per-stone tonal noise,
 * corner quoins, a window grid with sills, moulded lintels and alternating
 * triangular/segmental pediments on the étage noble, juliet window guards,
 * wrought-iron balcony bands on the 2nd and top-1 floors, and a darker stone
 * shopfront band (with signage) at street level.
 * Also produces an emissive map with a scattering of warmly lit windows
 * (it's dusk in Paris). Deterministic per `seed`.
 */
export function makeFacadeTextures(
  cols: number,
  rows: number,
  baseColor: string,
  seed = 1,
  litRatio = 0.28,
): FacadeTextures {
  const W = 512;
  const H = 512;
  const [canvas, ctx] = makeCanvas(W, H);
  const [eCanvas, eCtx] = makeCanvas(W, H);
  const [bCanvas, bCtx] = makeCanvas(W, H);
  const rng = makeRng(seed);
  // Weathering uses its own RNG stream so adding/removing grime never
  // perturbs the deterministic lit-window pattern drawn from `rng`.
  const grimeRng = makeRng(seed * 7919 + 4211);

  /** Tapered, semi-transparent rain-runoff streak running down from (x, yTop). */
  const drawStreak = (x: number, yTop: number, len: number, topW: number): void => {
    const alpha = 0.1 + grimeRng() * 0.1;
    const drift = (grimeRng() - 0.5) * 3; // slight lean so streaks aren't ruler-straight
    const bottomW = topW * (0.25 + grimeRng() * 0.2);
    ctx.fillStyle = `rgba(40,36,30,${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(x - topW / 2, yTop);
    ctx.lineTo(x + topW / 2, yTop);
    ctx.lineTo(x + drift + bottomW / 2, yTop + len);
    ctx.lineTo(x + drift - bottomW / 2, yTop + len);
    ctx.closePath();
    ctx.fill();
  };

  // Stone base.
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, W, H);

  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, W, H);

  // Bump base: mid-grey = wall plane.
  bCtx.fillStyle = gray(128);
  bCtx.fillRect(0, 0, W, H);

  const groundBandH = H * FACADE_GROUND_BAND_FRAC; // shopfront band at the bottom
  const upperH = H - groundBandH;
  const rowH = upperH / rows;
  const colW = W / cols;

  // Ashlar stone courses with subtle per-block tonal variation, so the wall
  // doesn't read as a flat fill. The bump map reuses the same rng draw per
  // block, so relief variation lands on the same stones as the tint.
  const courseH = 20;
  for (let y = 0; y < H - groundBandH; y += courseH) {
    const stagger = ((y / courseH) % 2) * 34;
    for (let x = -34; x < W; x += 68) {
      const v = rng();
      ctx.fillStyle = v < 0.5 ? `rgba(0,0,0,${(0.02 + v * 0.05).toFixed(3)})` : `rgba(255,255,255,${((v - 0.5) * 0.07).toFixed(3)})`;
      ctx.fillRect(x + stagger, y, 68, courseH);
      bCtx.fillStyle = gray(122 + v * 14);
      bCtx.fillRect(x + stagger, y, 68, courseH);
    }
    // Course joint line (a recessed groove in the bump map).
    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    ctx.fillRect(0, y, W, 1.5);
    bCtx.fillStyle = gray(92);
    bCtx.fillRect(0, y, W, 1.5);
  }

  // Corner quoins: alternating long/short dressed blocks down both edges.
  const quoinW = Math.max(14, colW * 0.16);
  for (let y = 0, i = 0; y < H - groundBandH; y += courseH * 1.5, i++) {
    const w = i % 2 === 0 ? quoinW : quoinW * 0.66;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,252,242,0.16)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(0, y, w, courseH * 1.5 - 2);
    ctx.fillRect(W - w, y, w, courseH * 1.5 - 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.14)';
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, y + 0.5, w, courseH * 1.5 - 2);
    ctx.strokeRect(W - w - 0.5, y + 0.5, w, courseH * 1.5 - 2);
    // Quoins sit slightly proud of the wall.
    bCtx.fillStyle = gray(i % 2 === 0 ? 152 : 140);
    bCtx.fillRect(0, y, w, courseH * 1.5 - 2);
    bCtx.fillRect(W - w, y, w, courseH * 1.5 - 2);
  }

  // Windows (top of texture = top of wall). French windows: tall and narrow.
  const balconyRows = [1, rows - 2].filter((r) => r >= 0 && r < rows);
  for (let r = 0; r < rows; r++) {
    const y0 = r * rowH;
    for (let c = 0; c < cols; c++) {
      const x0 = c * colW;
      const wx = x0 + colW * WINDOW_X_FRAC;
      const wy = y0 + rowH * WINDOW_Y_FRAC;
      const ww = colW * WINDOW_W_FRAC;
      const wh = rowH * WINDOW_H_FRAC;

      // Stone sill under the window.
      ctx.fillStyle = 'rgba(255,252,240,0.5)';
      ctx.fillRect(wx - ww * 0.12, wy + wh, ww * 1.24, 3.5);
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(wx - ww * 0.12, wy + wh + 3.5, ww * 1.24, 1.5);

      // Rain-runoff grime streaking down the stone from under the sill.
      if (grimeRng() < 0.4) {
        const streaks = 2 + (grimeRng() < 0.5 ? 1 : 0);
        for (let i = 0; i < streaks; i++) {
          const sxr = wx + ww * (0.1 + grimeRng() * 0.8);
          const len = rowH * (1.5 + grimeRng() * 1.5);
          drawStreak(sxr, wy + wh + 5, len, 2 + grimeRng() * 4);
        }
      }

      // Moulded lintel ledge above the window.
      ctx.fillStyle = 'rgba(255,252,240,0.55)';
      ctx.fillRect(wx - ww * 0.14, wy - 6, ww * 1.28, 4);
      ctx.fillStyle = 'rgba(0,0,0,0.15)';
      ctx.fillRect(wx - ww * 0.14, wy - 2, ww * 1.28, 1.5);

      // Bump: window reveal recessed into the wall, sill/lintel proud.
      bCtx.fillStyle = gray(58);
      bCtx.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
      bCtx.fillStyle = gray(176);
      bCtx.fillRect(wx - ww * 0.12, wy + wh, ww * 1.24, 3.5);
      bCtx.fillRect(wx - ww * 0.14, wy - 6, ww * 1.28, 4);

      // Pediment on the étage noble (row 1): triangular / segmental alternating.
      if (r === 1 && rows >= 4) {
        ctx.strokeStyle = 'rgba(60,52,40,0.55)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        if (c % 2 === 0) {
          ctx.moveTo(wx - ww * 0.16, wy - 7);
          ctx.lineTo(wx + ww * 0.5, wy - 7 - rowH * 0.14);
          ctx.lineTo(wx + ww * 1.16, wy - 7);
        } else {
          ctx.arc(wx + ww * 0.5, wy + 4, ww * 0.72, Math.PI * 1.15, Math.PI * 1.85);
        }
        ctx.stroke();
      }

      // Glass: lit or dusk-dark, with a faint vertical sheen.
      const lit = rng() < litRatio;
      ctx.fillStyle = lit ? '#f5c56a' : '#28303c';
      ctx.fillRect(wx, wy, ww, wh);
      if (!lit) {
        ctx.fillStyle = 'rgba(120,140,170,0.18)';
        ctx.fillRect(wx + ww * 0.12, wy, ww * 0.18, wh);
      }

      // Window frame, center mullion and transom bars (French casement).
      ctx.strokeStyle = 'rgba(250,244,228,0.9)';
      ctx.lineWidth = 2;
      ctx.strokeRect(wx, wy, ww, wh);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(wx + ww / 2, wy);
      ctx.lineTo(wx + ww / 2, wy + wh);
      ctx.moveTo(wx, wy + wh * 0.33);
      ctx.lineTo(wx + ww, wy + wh * 0.33);
      ctx.moveTo(wx, wy + wh * 0.66);
      ctx.lineTo(wx + ww, wy + wh * 0.66);
      ctx.stroke();

      // Juliet wrought-iron guard on non-balcony floors (every Haussmann
      // window has one).
      if (!balconyRows.includes(r) && r > 0) {
        ctx.fillStyle = 'rgba(24,26,30,0.9)';
        ctx.fillRect(wx - 2, wy + wh - 1, ww + 4, 2);
        for (let bx = wx; bx <= wx + ww; bx += 4) {
          ctx.fillRect(bx, wy + wh - 9, 1.2, 9);
        }
      }

      if (lit) {
        eCtx.fillStyle = '#ffb85c';
        eCtx.fillRect(wx, wy, ww, wh);
      }
    }
  }

  // Continuous balcony bands (wrought iron) on the 2nd and top-1 floors —
  // the classic Haussmann silhouette. (Real 3D balconies overlay these.)
  for (const r of balconyRows) {
    const yBottom = r * rowH + rowH * 0.85;
    ctx.fillStyle = 'rgba(24,26,30,0.9)';
    ctx.fillRect(0, yBottom, W, 4);
    for (let x = 0; x < W; x += 7) ctx.fillRect(x, yBottom - 13, 1.6, 13);
    for (let x = 0; x < W; x += 28) {
      ctx.strokeStyle = 'rgba(24,26,30,0.75)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(x + 14, yBottom - 7, 4.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    // String-course shadow under the balcony slab.
    ctx.fillStyle = 'rgba(0,0,0,0.16)';
    ctx.fillRect(0, yBottom + 4, W, 3);

    // Occasional broad runoff stains bleeding down from the balcony slab.
    for (let x = W * 0.05; x < W; x += W / 7) {
      if (grimeRng() < 0.25) {
        drawStreak(
          x + grimeRng() * 24,
          yBottom + 7,
          rowH * (1.2 + grimeRng() * 1.4),
          6 + grimeRng() * 8,
        );
      }
    }
  }

  // Ground-floor band: darker stone with tall shop openings and sign boards.
  const gy = H - groundBandH;
  ctx.fillStyle = '#8d7d68';
  ctx.fillRect(0, gy, W, groundBandH);
  // Rusticated joints in the ground-floor stone.
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  for (let y = gy; y < H; y += 14) ctx.fillRect(0, y, W, 1.5);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, gy, W, 3);
  // Bump: rusticated band reads slightly proud with deep joints.
  bCtx.fillStyle = gray(138);
  bCtx.fillRect(0, gy, W, groundBandH);
  bCtx.fillStyle = gray(84);
  for (let y = gy; y < H; y += 14) bCtx.fillRect(0, y, W, 2);

  const shops = Math.max(2, Math.round(cols / 1.5));
  const shopW = W / shops;
  for (let s = 0; s < shops; s++) {
    const sx = s * shopW + shopW * 0.15;
    const sw = shopW * 0.7;
    const oy = gy + groundBandH * 0.28;
    const oh = groundBandH * 0.66;
    const lit = rng() < 0.4;

    // Dark shopfront surround (recessed vitrine in the bump map).
    ctx.fillStyle = '#3a3229';
    ctx.fillRect(sx - 3, oy - 3, sw + 6, oh + 3);
    bCtx.fillStyle = gray(52);
    bCtx.fillRect(sx - 3, oy - 3, sw + 6, oh + 3);
    ctx.fillStyle = lit ? '#e8b866' : '#1e232b';
    ctx.fillRect(sx, oy, sw, oh);
    // Door mullion at one side of the vitrine.
    ctx.fillStyle = '#3a3229';
    ctx.fillRect(sx + sw * 0.68, oy, 2.5, oh);

    // Sign board above the opening with blocky "lettering".
    ctx.fillStyle = '#242826';
    ctx.fillRect(sx - 3, gy + groundBandH * 0.1, sw + 6, groundBandH * 0.14);
    ctx.fillStyle = lit ? '#e9d9a8' : '#9a9484';
    let lx = sx + 4;
    while (lx < sx + sw - 8) {
      const lw = 4 + rng() * 9;
      ctx.fillRect(lx, gy + groundBandH * 0.135, lw, groundBandH * 0.07);
      lx += lw + 4;
    }

    if (lit) {
      eCtx.fillStyle = '#d99a45';
      eCtx.fillRect(sx, oy, sw, oh);
    }
  }

  // Street-level grime: the bottom of every urban facade collects traffic
  // film and splash-back. Drawn last so it darkens shopfronts and stone alike.
  const dirtTop = H * 0.72;
  const dirt = ctx.createLinearGradient(0, dirtTop, 0, H);
  dirt.addColorStop(0, 'rgba(15,12,10,0)');
  dirt.addColorStop(1, 'rgba(15,12,10,0.25)');
  ctx.fillStyle = dirt;
  ctx.fillRect(0, dirtTop, W, H - dirtTop);

  return { map: toTexture(canvas), emissiveMap: toTexture(eCanvas), bumpMap: toBumpTexture(bCanvas) };
}

/**
 * Repeating wrought-iron balcony railing on a transparent background: top and
 * bottom rails, vertical balusters and a scroll rosette per tile. Applied to
 * thin planes with alphaTest so one texture stands in for hundreds of bars.
 * One tile is meant to span ~1.1 world units; UVs are scaled per balcony.
 */
export function makeIronRailingTexture(): THREE.CanvasTexture {
  const W = 128;
  const H = 64;
  const [canvas, ctx] = makeCanvas(W, H);
  ctx.clearRect(0, 0, W, H);
  const iron = '#191b1f';
  ctx.fillStyle = iron;
  // Top rail (double) and bottom rail.
  ctx.fillRect(0, 2, W, 4);
  ctx.fillRect(0, 10, W, 2);
  ctx.fillRect(0, H - 5, W, 4);
  // Balusters.
  for (let x = 4; x < W; x += 12) ctx.fillRect(x, 4, 2.5, H - 6);
  // Scroll motif: an S of two circles between the mid balusters of the tile.
  ctx.strokeStyle = iron;
  ctx.lineWidth = 2.5;
  for (const cx of [32, 96]) {
    ctx.beginPath();
    ctx.arc(cx, 26, 7, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, 42, 5, 0, Math.PI * 2);
    ctx.stroke();
  }
  const tex = toTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/**
 * Classic café-awning stripes (vertical), with a darker fold shadow at the
 * bottom edge so the valance reads. One tile = 4 stripe pairs.
 */
export function makeAwningStripeTexture(colorA: string, colorB: string): THREE.CanvasTexture {
  const S = 128;
  const [canvas, ctx] = makeCanvas(S, S);
  const stripe = S / 8;
  for (let i = 0; i < 8; i++) {
    ctx.fillStyle = i % 2 === 0 ? colorA : colorB;
    ctx.fillRect(i * stripe, 0, stripe, S);
  }
  // Fabric shading: subtle vertical gradient + fold lines on stripe edges.
  const g = ctx.createLinearGradient(0, 0, 0, S);
  g.addColorStop(0, 'rgba(255,255,255,0.10)');
  g.addColorStop(0.7, 'rgba(0,0,0,0.05)');
  g.addColorStop(1, 'rgba(0,0,0,0.22)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  for (let i = 0; i <= 8; i++) ctx.fillRect(i * stripe - 1, 0, 2, S);
  const tex = toTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

export interface CobblestoneTextures {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
}

/** Granite sett / cobblestone pattern for the tower plaza. Tileable, with a
 *  matching bump map (dark joints, lighter raised stone tops). */
export function makeCobblestoneTextures(): CobblestoneTextures {
  const S = 256;
  const [canvas, ctx] = makeCanvas(S, S);
  const [bCanvas, bCtx] = makeCanvas(S, S);
  const rng = makeRng(517);
  ctx.fillStyle = '#6f675e'; // joint mortar/shadow color
  ctx.fillRect(0, 0, S, S);
  bCtx.fillStyle = gray(60); // joints are the low points
  bCtx.fillRect(0, 0, S, S);
  const rows = 10;
  const cellH = S / rows;
  const cellW = S / 8;
  for (let r = 0; r < rows; r++) {
    const offset = (r % 2) * (cellW / 2);
    for (let x = -cellW; x < S + cellW; x += cellW) {
      const tone = 122 + Math.floor(rng() * 28);
      ctx.fillStyle = `rgb(${tone + 8},${tone + 2},${tone - 8})`;
      const px = x + offset + 1.5;
      const py = r * cellH + 1.5;
      ctx.beginPath();
      ctx.roundRect(px, py, cellW - 3, cellH - 3, 4);
      ctx.fill();
      // Light top edge for a hint of relief.
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(px + 2, py + 1, cellW - 7, 2);
      // Bump: same stone, same rng tone driving the raised top.
      bCtx.fillStyle = gray(120 + (tone - 122) * 2);
      bCtx.beginPath();
      bCtx.roundRect(px, py, cellW - 3, cellH - 3, 4);
      bCtx.fill();
    }
  }
  // Grime: soft dark oil/dirt blotches plus a few lighter foot-worn patches.
  // Deliberately matte (no bright gradient centers — dry grime, not puddles)
  // and inset from the tile edges so the texture keeps tiling seamlessly.
  const blotches = 12 + Math.floor(rng() * 5);
  for (let i = 0; i < blotches; i++) {
    const radius = 8 + rng() * 12;
    const cx = radius + rng() * (S - radius * 2);
    const cy = radius + rng() * (S - radius * 2);
    const g = ctx.createRadialGradient(cx, cy, radius * 0.15, cx, cy, radius);
    g.addColorStop(0, 'rgba(20,18,14,0.15)');
    g.addColorStop(1, 'rgba(20,18,14,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }
  for (let i = 0; i < 5; i++) {
    const radius = 10 + rng() * 12;
    const cx = radius + rng() * (S - radius * 2);
    const cy = radius + rng() * (S - radius * 2);
    const g = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius);
    g.addColorStop(0, 'rgba(200,195,180,0.08)');
    g.addColorStop(1, 'rgba(200,195,180,0)');
    ctx.fillStyle = g;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }
  const map = toTexture(canvas);
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  const bumpMap = toBumpTexture(bCanvas);
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  return { map, bumpMap };
}

/**
 * Standalone tileable asphalt relief: coarse aggregate speckle plus a few
 * shallow patch seams. The road material has no diffuse map (flat color), and
 * a bump map works fine on its own.
 */
export function makeAsphaltBumpMap(): THREE.CanvasTexture {
  const S = 128;
  const [canvas, ctx] = makeCanvas(S, S);
  const rng = makeRng(90210);
  ctx.fillStyle = gray(128);
  ctx.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    const v = rng();
    ctx.fillStyle = gray(112 + v * 34);
    ctx.fillRect(Math.floor(rng() * S), Math.floor(rng() * S), 1 + (rng() < 0.3 ? 1 : 0), 1);
  }
  // A couple of faint seams (kept horizontal/vertical so the tile stays seamless).
  ctx.fillStyle = gray(108);
  ctx.fillRect(0, Math.floor(S * 0.31), S, 1);
  ctx.fillRect(Math.floor(S * 0.72), 0, 1, S);
  const tex = toBumpTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Guimard-green Métro sign panel with amber MÉTROPOLITAIN lettering. */
export function makeMetroSignTexture(): THREE.CanvasTexture {
  const W = 512;
  const H = 96;
  const [canvas, ctx] = makeCanvas(W, H);
  ctx.fillStyle = '#17332a';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#f0b53e';
  ctx.lineWidth = 5;
  ctx.strokeRect(7, 7, W - 14, H - 14);
  ctx.fillStyle = '#f5c04a';
  ctx.font = 'bold 52px Georgia, "Times New Roman", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('MÉTROPOLITAIN', W / 2, H / 2 + 3);
  return toTexture(canvas);
}

/** One white crosswalk bar per tile, repeated along the crossing. */
export function makeCrosswalkTexture(): THREE.CanvasTexture {
  const S = 64;
  const [canvas, ctx] = makeCanvas(S, S);
  ctx.clearRect(0, 0, S, S);
  ctx.fillStyle = 'rgba(226,226,214,0.8)';
  ctx.fillRect(0, 18, S, 28);
  const tex = toTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Dashed white centerline on transparent background; tiled along road length. */
export function makeRoadDashTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(32, 128);
  ctx.clearRect(0, 0, 32, 128);
  ctx.fillStyle = 'rgba(235,235,225,0.85)';
  ctx.fillRect(12, 8, 8, 56); // one dash + gap per tile
  const tex = toTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Dusk sky vertical gradient used as the scene background. */
export function makeSkyTexture(): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(4, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  for (const [stop, color] of SKY_GRADIENT_STOPS) g.addColorStop(stop, color);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 4, 512);
  return toTexture(canvas);
}

/** Radial white-to-transparent burst for the muzzle flash sprite. */
export function makeFlashTexture(): THREE.CanvasTexture {
  const S = 64;
  const [canvas, ctx] = makeCanvas(S, S);
  const g = ctx.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(255,255,235,1)');
  g.addColorStop(0.3, 'rgba(255,214,130,0.9)');
  g.addColorStop(1, 'rgba(255,160,60,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, S, S);
  return toTexture(canvas);
}
