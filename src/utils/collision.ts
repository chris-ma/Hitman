import * as THREE from 'three';

/** Axis-aligned footprint in the XZ plane (buildings, tower legs, ...). */
export interface AABB {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * Resolve a circle (the player, seen from above) against a list of AABBs.
 * Each AABB is expanded by the circle radius, then the point is pushed out
 * along the axis with the smallest penetration. Resolving per-axis like this
 * gives natural wall-sliding behaviour.
 *
 * Mutates `pos` in place (only x and z).
 */
export function resolveCircleAABBs(pos: THREE.Vector3, radius: number, boxes: AABB[]): void {
  for (const b of boxes) {
    const minX = b.minX - radius;
    const maxX = b.maxX + radius;
    const minZ = b.minZ - radius;
    const maxZ = b.maxZ + radius;

    if (pos.x <= minX || pos.x >= maxX || pos.z <= minZ || pos.z >= maxZ) continue;

    const penLeft = pos.x - minX;
    const penRight = maxX - pos.x;
    const penNear = pos.z - minZ;
    const penFar = maxZ - pos.z;
    const minPen = Math.min(penLeft, penRight, penNear, penFar);

    if (minPen === penLeft) pos.x = minX;
    else if (minPen === penRight) pos.x = maxX;
    else if (minPen === penNear) pos.z = minZ;
    else pos.z = maxZ;
  }
}
