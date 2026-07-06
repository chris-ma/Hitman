import * as THREE from 'three';
import {
  makeRoadDashTexture,
  makeCobblestoneTextures,
  makeCrosswalkTexture,
  makeAsphaltBumpMap,
} from './proceduralTextures';

export interface BuiltGround {
  group: THREE.Group;
  /** Meshes the player ground-snap raycast should hit (base, roads, sidewalks, plaza). */
  walkables: THREE.Mesh[];
}

const SIDEWALK_H = 0.15;

export function buildGround(): BuiltGround {
  const group = new THREE.Group();
  const walkables: THREE.Mesh[] = [];

  const asphaltBump = makeAsphaltBumpMap();

  /** Clone the asphalt bump with a per-surface repeat (~1 tile / 4 units). */
  const bumpFor = (w: number, d: number): THREE.Texture => {
    const t = asphaltBump.clone();
    t.repeat.set(Math.max(1, Math.round(w / 4)), Math.max(1, Math.round(d / 4)));
    return t;
  };

  // Base plane: generic urban pavement everywhere.
  const base = new THREE.Mesh(
    new THREE.PlaneGeometry(500, 500),
    new THREE.MeshStandardMaterial({
      color: 0x4a484c,
      roughness: 1,
      envMapIntensity: 0.2,
      bumpMap: bumpFor(500, 500),
      bumpScale: 0.025,
    }),
  );
  base.rotation.x = -Math.PI / 2;
  group.add(base);
  walkables.push(base);

  const asphaltFor = (w: number, d: number) =>
    new THREE.MeshStandardMaterial({
      color: 0x323236,
      roughness: 0.95,
      envMapIntensity: 0.25,
      bumpMap: bumpFor(w, d),
      bumpScale: 0.025,
    });

  // Main boulevard (east-west), extended west to reach the tower plaza.
  const mainRoad = new THREE.Mesh(new THREE.PlaneGeometry(230, 16), asphaltFor(230, 16));
  mainRoad.rotation.x = -Math.PI / 2;
  mainRoad.position.set(-15, 0.04, 0);
  group.add(mainRoad);
  walkables.push(mainRoad);

  // Cross street (north-south).
  const crossRoad = new THREE.Mesh(new THREE.PlaneGeometry(16, 170), asphaltFor(16, 170));
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
  const walkMat = new THREE.MeshStandardMaterial({ color: 0x6e6862, roughness: 1, envMapIntensity: 0.2 });
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

  // Pedestrian crosswalks at the boulevard / cross-street intersection.
  const zebraTex = makeCrosswalkTexture();
  const zebraMat = new THREE.MeshBasicMaterial({ map: zebraTex, transparent: true, depthWrite: false });
  const addCrosswalk = (cx: number, cz: number, rotY: number) => {
    const tex = zebraTex.clone();
    tex.repeat.set(1, 11);
    const m = zebraMat.clone();
    m.map = tex;
    const zebra = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 15.4), m);
    zebra.rotation.order = 'YXZ';
    zebra.rotation.y = rotY;
    zebra.rotation.x = -Math.PI / 2;
    zebra.position.set(cx, 0.06, cz);
    group.add(zebra);
  };
  addCrosswalk(-10.5, 0, 0); // across the boulevard, west side of the junction
  addCrosswalk(10.5, 0, 0); // east side
  addCrosswalk(0, -10.5, Math.PI / 2); // across the cross street, north side
  addCrosswalk(0, 10.5, Math.PI / 2); // south side

  // Tower plaza: broad esplanade of granite setts at the west end.
  const { map: cobbleTex, bumpMap: cobbleBump } = makeCobblestoneTextures();
  cobbleTex.repeat.set(34, 42);
  cobbleBump.repeat.set(34, 42);
  const plaza = new THREE.Mesh(
    new THREE.BoxGeometry(90, 0.1, 110),
    new THREE.MeshStandardMaterial({
      map: cobbleTex,
      roughness: 1,
      envMapIntensity: 0.25,
      bumpMap: cobbleBump,
      bumpScale: 0.04,
    }),
  );
  plaza.position.set(-152, 0.05, 0);
  group.add(plaza);
  walkables.push(plaza);

  return { group, walkables };
}
