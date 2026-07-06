import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FilmGradeShader } from './shaders/FilmGradeShader';
import { IS_TOUCH_DEVICE } from '../utils/device';

// SSAO and bloom render internal buffers at a fraction of full resolution on
// touch devices; desktop runs them at full size.
const HEAVY_PASS_SCALE = IS_TOUCH_DEVICE ? 0.5 : 1;

/**
 * Full-screen pipeline: MSAA HDR render → subtle SSAO → restrained bloom →
 * combined film grade (vignette / edge CA / grain / contrast) → OutputPass.
 *
 * OutputPass MUST stay last: once rendering goes through offscreen buffers,
 * three.js no longer applies ACES tone mapping or the sRGB conversion itself —
 * OutputPass reapplies both, once, at the end. The explicit HalfFloatType MSAA
 * render target gives free antialiasing on WebGL2 (no FXAA pass) and keeps
 * genuinely HDR emissives (tower beacon at intensity 3) available for bloom
 * thresholding.
 */
export class PostProcessing {
  private readonly composer: EffectComposer;
  private readonly ssaoPass: SSAOPass;
  private readonly bloomPass: UnrealBloomPass;
  private readonly filmPass: ShaderPass;
  private time = 0;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const pr = renderer.getPixelRatio();

    const rt = new THREE.WebGLRenderTarget(w * pr, h * pr, {
      samples: IS_TOUCH_DEVICE ? 2 : 4,
      type: THREE.HalfFloatType,
    });
    this.composer = new EffectComposer(renderer, rt);

    this.composer.addPass(new RenderPass(scene, camera));

    // Subtle contact darkening. Distances are normalized against camera
    // far (900), so these small values are ~0.4 / ~18 world units.
    this.ssaoPass = new SSAOPass(scene, camera, w * pr * HEAVY_PASS_SCALE, h * pr * HEAVY_PASS_SCALE);
    this.ssaoPass.kernelRadius = IS_TOUCH_DEVICE ? 1.6 : 2.5;
    this.ssaoPass.minDistance = 0.0004;
    this.ssaoPass.maxDistance = 0.02;
    this.composer.addPass(this.ssaoPass);

    // Restrained: the high threshold keeps bloom to lit windows, streetlamps,
    // the tower beacon and muzzle flashes — not the warm sky.
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(w * pr * HEAVY_PASS_SCALE, h * pr * HEAVY_PASS_SCALE),
      0.32, // strength
      0.4, // radius
      0.85, // threshold
    );
    this.composer.addPass(this.bloomPass);

    this.filmPass = new ShaderPass(FilmGradeShader);
    this.composer.addPass(this.filmPass);

    // Tone mapping + sRGB output. Not optional; see class doc.
    this.composer.addPass(new OutputPass());

    // Normalize every pass to the real sizes (addPass sizes them from the
    // raw render-target dimensions, which are already pixel-ratio scaled).
    this.setSize(w, h);

    window.addEventListener('resize', () => this.setSize(window.innerWidth, window.innerHeight));
  }

  /** Resize the composer (which resizes every pass's buffers) in CSS pixels. */
  setSize(width: number, height: number): void {
    // The composer was built around an explicit pixel-sized target, so feed
    // it pixel dimensions directly (its own pixelRatio bookkeeping assumes
    // CSS sizes only for the default-constructed target).
    const pr = this.composer.renderer.getPixelRatio();
    const w = width * pr;
    const h = height * pr;
    this.composer.setPixelRatio(1);
    this.composer.setSize(w, h);
    if (HEAVY_PASS_SCALE !== 1) {
      this.ssaoPass.setSize(w * HEAVY_PASS_SCALE, h * HEAVY_PASS_SCALE);
      this.bloomPass.setSize(w * HEAVY_PASS_SCALE, h * HEAVY_PASS_SCALE);
    }
  }

  render(dt: number): void {
    this.time += dt;
    this.filmPass.uniforms['time'].value = this.time;
    this.composer.render(dt);
  }
}
