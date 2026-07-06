import * as THREE from 'three';
import { makeSkyTexture, makeMistTexture } from '../world/proceduralTextures';
import { buildEnvironmentTexture } from '../world/Environment';
import { IS_TOUCH_DEVICE, getViewportSize } from '../utils/device';

/**
 * Renderer, scene, camera, and the evening-Paris mood: dusk gradient sky,
 * matching fog, warm low-angle sun from the west plus a cool hemisphere fill.
 * The sun casts real-time shadows from a modest orthographic frustum that is
 * recentered on the player every frame (see updateSunFollow).
 */
export class SceneSetup {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  private readonly sun: THREE.DirectionalLight;
  /** Slowly drifting ground-mist textures, scrolled every frame in update(). */
  private readonly mistTextures: THREE.CanvasTexture[] = [];

  constructor(container: HTMLElement) {
    const { width, height } = getViewportSize();

    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    // Weaker mobile GPUs benefit more from a lower resolution than from AA headroom.
    const maxPixelRatio = IS_TOUCH_DEVICE ? 1.5 : 2;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = makeSkyTexture();
    // Dusk PMREM environment: specular reflections on ironwork/glass/stone.
    this.scene.environment = buildEnvironmentTexture(this.renderer);
    // Fog color matches the warm horizon band of the sky gradient so the
    // world edge dissolves instead of hard-cutting. Far enough to keep the
    // tower visible from spawn (~200 units away).
    this.scene.fog = new THREE.Fog(0xdb9a70, 90, 480);

    // Ground-hugging mist: two big semi-transparent planes just above street
    // level with a slowly scrolling alpha-noise texture. Purely atmospheric —
    // non-colliding, depth-write off so it never occludes or breaks sorting.
    for (const [y, repX, repY, opacity] of [
      [0.5, 13, 8, 0.2],
      [0.95, 9, 6, 0.13],
    ] as const) {
      const tex = makeMistTexture();
      tex.repeat.set(repX, repY);
      this.mistTextures.push(tex);
      const mist = new THREE.Mesh(
        new THREE.PlaneGeometry(470, 300),
        new THREE.MeshBasicMaterial({
          map: tex,
          transparent: true,
          opacity,
          depthWrite: false,
        }),
      );
      mist.rotation.x = -Math.PI / 2;
      mist.position.set(-52, y, 0); // centered on the built district
      mist.renderOrder = 2; // after other transparents at the same depth
      this.scene.add(mist);
    }

    this.camera = new THREE.PerspectiveCamera(72, width / height, 0.1, 900);
    // The camera carries the weapon viewmodel, so it must be in the graph.
    this.scene.add(this.camera);

    // Lower than the pre-shadow original (1.05): the PMREM environment now
    // contributes diffuse ambient light too, so the hemisphere no longer
    // carries the whole ambient term alone.
    const hemi = new THREE.HemisphereLight(0x9aa7cf, 0x5a4a3c, 0.85);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffc490, 1.55);
    sun.position.set(-160, 70, 55); // low in the west, behind the tower
    sun.castShadow = true;
    // Shadow camera: a deliberately modest ortho frustum. It never covers the
    // whole district — updateSunFollow() recenters it on the player each
    // frame, which buys far better effective resolution than one giant map.
    const mapSize = IS_TOUCH_DEVICE ? 1024 : 2048;
    sun.shadow.mapSize.set(mapSize, mapSize);
    const extent = IS_TOUCH_DEVICE ? 45 : 60;
    sun.shadow.camera.left = -extent;
    sun.shadow.camera.right = extent;
    sun.shadow.camera.top = extent;
    sun.shadow.camera.bottom = -extent;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 220; // light sits ~183 units out; +ground/building depth
    sun.shadow.bias = -0.002;
    sun.shadow.normalBias = 0.03;
    this.scene.add(sun);
    // The target must be in the graph for its matrixWorld to update.
    this.scene.add(sun.target);
    this.sun = sun;
  }

  /**
   * Keep the sun at its fixed relative offset but recentered on `target`
   * (the player) so the modest shadow frustum always covers nearby geometry
   * at full resolution. Frustum dimensions never change, so no
   * updateProjectionMatrix() is needed.
   */
  updateSunFollow(target: THREE.Vector3): void {
    this.sun.position.set(target.x - 160, target.y + 70, target.z + 55);
    this.sun.target.position.set(target.x, 0, target.z);
  }

  /** Per-frame ambience: drift the mist layers in slightly different directions. */
  update(dt: number): void {
    const [a, b] = this.mistTextures;
    a.offset.x += dt * 0.006;
    a.offset.y += dt * 0.0022;
    b.offset.x -= dt * 0.0035;
    b.offset.y += dt * 0.0028;
  }

  /**
   * Re-fit the camera and renderer to a new viewport size. Must be called on
   * every resize/orientation change — without it the camera aspect and the
   * renderer's backing buffer stay locked to whatever size existed at
   * construction (e.g. a phone's portrait dimensions before the player
   * rotates to landscape), which is what produces a stretched/cropped canvas.
   */
  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }
}
