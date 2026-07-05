import * as THREE from 'three';
import { makeSkyTexture } from '../world/proceduralTextures';
import { IS_TOUCH_DEVICE } from '../utils/device';

/**
 * Renderer, scene, camera, and the evening-Paris mood: dusk gradient sky,
 * matching fog, warm low-angle sun from the west plus a cool hemisphere fill.
 */
export class SceneSetup {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;

  constructor(container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    // Weaker mobile GPUs benefit more from a lower resolution than from AA headroom.
    const maxPixelRatio = IS_TOUCH_DEVICE ? 1.5 : 2;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = makeSkyTexture();
    // Fog color matches the warm horizon band of the sky gradient so the
    // world edge dissolves instead of hard-cutting. Far enough to keep the
    // tower visible from spawn (~200 units away).
    this.scene.fog = new THREE.Fog(0xdb9a70, 90, 480);

    this.camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 900);
    // The camera carries the weapon viewmodel, so it must be in the graph.
    this.scene.add(this.camera);

    const hemi = new THREE.HemisphereLight(0x9aa7cf, 0x5a4a3c, 1.05);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xffc490, 1.7);
    sun.position.set(-160, 70, 55); // low in the west, behind the tower
    this.scene.add(sun);

    window.addEventListener('resize', () => {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(window.innerWidth, window.innerHeight);
    });
  }
}
