import * as THREE from 'three';

const poleMat = new THREE.MeshStandardMaterial({ color: 0x1f2a24, roughness: 0.6, metalness: 0.4 });
const lampMat = new THREE.MeshStandardMaterial({
  color: 0xffe0a8,
  emissive: 0xffc078,
  emissiveIntensity: 2.2,
});

/**
 * Parisian-style dark green lamp post. Only a few instances get a real
 * PointLight (near the player spawn) — the rest just glow emissively.
 */
export function buildStreetlight(x: number, z: number, withLight: boolean): THREE.Group {
  const group = new THREE.Group();
  group.position.set(x, 0, z);

  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 4.4, 8), poleMat);
  pole.position.y = 2.2;
  group.add(pole);

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.12, 8), poleMat);
  collar.position.y = 4.35;
  group.add(collar);

  const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 10), lampMat);
  lamp.position.y = 4.65;
  group.add(lamp);

  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.34, 0.3, 8), poleMat);
  cap.position.y = 4.95;
  group.add(cap);

  if (withLight) {
    const light = new THREE.PointLight(0xffc078, 22, 22, 2);
    light.position.y = 4.6;
    group.add(light);
  }

  return group;
}
