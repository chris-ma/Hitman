import * as THREE from 'three';
import { makeRoadDashTexture } from './proceduralTextures';

export interface BuiltGround {
  group: THREE.Group;
  /** Meshes the player ground-snap raycast should hit (base, roads, sidewalks, plaza). */
  walkables: THREE.Mesh[];
}

const SIDEWALK_H = 0.15;

export function buildGround(): BuiltGround {
  const group = new THREE.Group();
  const walkables: THREE.Mesh[] = [];

  // Base plane: generic urban pavement everywhere.
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 500),
    new THREE.MeshStandardMaterial({ color: 0x4a484c, roughness: 1 }),
  );
  base.rotation.x = -Math.PI / 2;
  group.add(base);
  walkables.push(base);

  const asphalt = new THREE.MeshStandardMaterial({ color: 0x323236, roughness: 0.95 });

  // Main boulevard (east-west), extended west to reach the tower plaza.
  const mainRoad = new THREE.Mesh(new THREE.PlaneGeometry(230, 16), asphalt);
  mainRoad.rotation.x = -Math.PI / 2;
  mainRoad.position.set(-15, 0.04, 0);
  group.add(mainRoad);
  walkables.push(mainRoad);

  // Cross street (north-south).
  const crossRoad = new THREE.Mesh(new THREE.PlaneGeometry(16, 170), asphalt);
  crossRoad.rotation.x = -Math.PI / 2;
  crossRoad.position.set(0, 0.04, 0);
  group.add(crossRoad);
  walkables.push(crossRoad);

  // Dashed centerlines.
  const dashTex = makeRoadDashTexture();
  const dashMat = new THREE.MeshBasicMaterial({ map: dashTex, transparent: true, depthWrite: false });

  const mainDashTex = dashTex.clone();
  mainDashTex.repeat.set(1, 230 / 6);
  const mainDash = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 230), dashMat.clone());
  (mainDash.material as THREE.MeshBasicMaterial).map = mainDashTex;
  mainDash.rotation.x = -Math.PI / 2;
  mainDash.rotation.z = Math.PI / 2;
  mainDash.position.set(-15, 0.09, 0);
  group.add(mainDash);

  const crossDashTex = dashTex.clone();
  crossDashTex.repeat.set(1, 170 / 6);
  const crossDash = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 170), dashMat.clone());
  (crossDash.material as THREE.MeshBasicMaterial).map = crossDashTex;
  crossDash.rotation.x = -Math.PI / 2;
  crossDash.position.set(0, 0.09, 0);
  group.add(crossDash);

  // Sidewalks: raised slabs so the ground-snap raycast steps the player up.
  const walkMat = new THREE.MeshStandardMaterial({ color: 0x6e6862, roughness: 1 });
  const addSidewalk = (cx: number, cz: number, w: number, d: number) => {
    const s = new THREE.Mesh(new THREE.BoxGeometry(w, SIDEWALK_H, d), walkMat);
    s.position.set(cx, SIDEWALK_H / 2, cz);
    group.add(s);
    walkables.push(s);
  };

  // Boulevard sidewalks (split around the cross street).
  addSidewalk(-49.5, -10, 79, 4); // x in [-89, -10], north side
  addSidewalk(49.5, -10, 79, 4); // x in [10, 89]
  addSidewalk(-49.5, 10, 79, 4);
  addSidewalk(49.5, 10, 79, 4);
  // Cross-street sidewalks (split around the boulevard).
  addSidewalk(-10, -46.5, 4, 73); // z in [-83, -10], west side
  addSidewalk(-10, 46.5, 4, 73);
  addSidewalk(10, -46.5, 4, 73);
  addSidewalk(10, 46.5, 4, 73);

  // Tower plaza: broad light stone esplanade at the west end.
  const plaza = new THREE.Mesh(
    new THREE.BoxGeometry(90, 0.1, 110),
    new THREE.MeshStandardMaterial({ color: 0x8a8178, roughness: 1 }),
  );
  plaza.position.set(-152, 0.05, 0);
  group.add(plaza);
  walkables.push(plaza);

  return { group, walkables };
}
