import * as THREE from 'three';

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

export interface FacadeTextures {
  map: THREE.CanvasTexture;
  emissiveMap: THREE.CanvasTexture;
}

/**
 * Haussmannian facade: cream stone, window grid, wrought-iron balcony bands on
 * the 2nd and 5th floors, darker stone shopfront band at street level.
 * Also produces an emissive map with a random scattering of warmly lit windows
 * (it's dusk in Paris).
 */
export function makeFacadeTextures(cols: number, rows: number, baseColor: string): FacadeTextures {
  const W = 256;
  const H = 256;
  const [canvas, ctx] = makeCanvas(W, H);
  const [eCanvas, eCtx] = makeCanvas(W, H);

  // Stone base with subtle horizontal banding
  ctx.fillStyle = baseColor;
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = 'rgba(0,0,0,0.05)';
  for (let y = 0; y < H; y += 10) ctx.fillRect(0, y, W, 1);

  eCtx.fillStyle = '#000000';
  eCtx.fillRect(0, 0, W, H);

  const groundBandH = H * 0.16; // shopfront band at the bottom of the texture
  const upperH = H - groundBandH;
  const rowH = upperH / rows;
  const colW = W / cols;

  // Windows (top of texture = top of wall). French windows: tall and narrow.
  for (let r = 0; r < rows; r++) {
    const y0 = r * rowH;
    for (let c = 0; c < cols; c++) {
      const x0 = c * colW;
      const wx = x0 + colW * 0.24;
      const wy = y0 + rowH * 0.18;
      const ww = colW * 0.52;
      const wh = rowH * 0.66;

      const lit = Math.random() < 0.28;
      ctx.fillStyle = lit ? '#f5c56a' : '#28303c';
      ctx.fillRect(wx, wy, ww, wh);
      // window frame + center mullion
      ctx.strokeStyle = 'rgba(250,244,228,0.9)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(wx, wy, ww, wh);
      ctx.beginPath();
      ctx.moveTo(wx + ww / 2, wy);
      ctx.lineTo(wx + ww / 2, wy + wh);
      ctx.stroke();

      if (lit) {
        eCtx.fillStyle = '#ffb85c';
        eCtx.fillRect(wx, wy, ww, wh);
      }
    }
  }

  // Balcony bands (wrought iron) on the 2nd and 5th floor from the top offsets;
  // classic Haussmann has continuous balconies at those levels.
  ctx.fillStyle = 'rgba(30,32,36,0.85)';
  const balconyRows = [1, rows - 2].filter((r) => r >= 0 && r < rows);
  for (const r of balconyRows) {
    const yBottom = r * rowH + rowH * 0.86;
    ctx.fillRect(0, yBottom, W, 2.5);
    for (let x = 0; x < W; x += 5) ctx.fillRect(x, yBottom - 6, 1, 6);
  }

  // Ground-floor band: darker stone with tall shop openings
  const gy = H - groundBandH;
  ctx.fillStyle = '#8d7d68';
  ctx.fillRect(0, gy, W, groundBandH);
  ctx.fillStyle = 'rgba(0,0,0,0.06)';
  ctx.fillRect(0, gy, W, 3);
  const shops = Math.max(2, Math.round(cols / 1.5));
  const shopW = W / shops;
  for (let s = 0; s < shops; s++) {
    const sx = s * shopW + shopW * 0.15;
    const lit = Math.random() < 0.35;
    ctx.fillStyle = lit ? '#e8b866' : '#1e232b';
    ctx.fillRect(sx, gy + groundBandH * 0.22, shopW * 0.7, groundBandH * 0.72);
    if (lit) {
      eCtx.fillStyle = '#d99a45';
      eCtx.fillRect(sx, gy + groundBandH * 0.22, shopW * 0.7, groundBandH * 0.72);
    }
  }

  return { map: toTexture(canvas), emissiveMap: toTexture(eCanvas) };
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
  g.addColorStop(0.0, '#2b3a63');
  g.addColorStop(0.45, '#6f5d7d');
  g.addColorStop(0.75, '#cf8a63');
  g.addColorStop(1.0, '#e8a06b');
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
