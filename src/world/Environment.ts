import * as THREE from 'three';
import { SKY_GRADIENT_STOPS } from './proceduralTextures';

/**
 * Builds the PMREM environment texture that gives every MeshStandardMaterial
 * believable dusk reflections (assigned to scene.environment in SceneSetup).
 *
 * A tiny dedicated scene is used instead of RoomEnvironment (generic indoor
 * mood, wrong for a Paris dusk) or feeding makeSkyTexture() through
 * fromEquirectangular (that texture is a flat vertical screen gradient, not a
 * true equirect map — read as one, its horizon band would land at the nadir
 * and reflections would show sky-glow on the ground). The scene is an
 * inverted vertex-colored sphere sampling the same four gradient stops as the
 * sky texture, plus a small hot warm sphere along the sun direction so
 * ironwork and glass pick up a believable specular glint.
 */
export function buildEnvironmentTexture(renderer: THREE.WebGLRenderer): THREE.Texture {
  const envScene = new THREE.Scene();

  const R = 50;
  const skyGeo = new THREE.SphereGeometry(R, 24, 16);
  const pos = skyGeo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const stops = SKY_GRADIENT_STOPS.map(([t, hex]) => ({ t, c: new THREE.Color(hex) }));
  const ground = new THREE.Color('#4a4340'); // dim warm asphalt/stone bounce
  const horizon = stops[stops.length - 1].c;
  const c = new THREE.Color();

  /** Sample the sky gradient at t ∈ [0 zenith .. 1 horizon]. */
  const sampleSky = (t: number, out: THREE.Color) => {
    for (let i = 0; i < stops.length - 1; i++) {
      const a = stops[i];
      const b = stops[i + 1];
      if (t <= b.t) {
        out.copy(a.c).lerp(b.c, THREE.MathUtils.clamp((t - a.t) / (b.t - a.t), 0, 1));
        return;
      }
    }
    out.copy(stops[stops.length - 1].c);
  };

  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / R; // 1 zenith .. -1 nadir
    if (y >= 0) {
      sampleSky(1 - y, c);
    } else {
      // Below the horizon: fade the warm glow into dark ground bounce.
      c.copy(horizon).lerp(ground, THREE.MathUtils.clamp(-y / 0.22, 0, 1));
    }
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  skyGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const skyMat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide });
  envScene.add(new THREE.Mesh(skyGeo, skyMat));

  // Soft HDR "sun" disc seeding the specular glint, along the real sun offset.
  const sunDir = new THREE.Vector3(-160, 70, 55).normalize();
  const sunMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 5.5, 3) });
  const sunGlow = new THREE.Mesh(new THREE.SphereGeometry(4.5, 12, 8), sunMat);
  sunGlow.position.copy(sunDir).multiplyScalar(R * 0.9);
  envScene.add(sunGlow);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromScene(envScene, 0.04);
  pmrem.dispose();
  skyGeo.dispose();
  skyMat.dispose();
  sunGlow.geometry.dispose();
  sunMat.dispose();

  return envRT.texture;
}
