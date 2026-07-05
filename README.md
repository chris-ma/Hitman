# Paris Contract

A browser-playable 3D FPS prototype set in a stylized modern Paris, built with
Three.js + Vite + TypeScript. Everything is generated from primitive geometry
and runtime canvas textures — no external assets, no physics engine.

## Run

```
npm install
npm run dev
```

Then open the printed local URL (default http://localhost:5173) and click to play.

## Controls

- Click — lock pointer / shoot
- Mouse — look
- WASD — move
- Space — jump
- Esc — release pointer (pause)

## Objective

Eliminate all hostiles patrolling the Haussmannian block beneath the Eiffel
Tower. They shoot back. Dying shows a respawn screen — click to try again.

## Tech notes

- Collision is hand-rolled: downward raycast for ground snapping, circle-vs-AABB
  push-out for buildings (see `src/utils/collision.ts`).
- All textures (window grids, road dashes, sky gradient, muzzle flash) are
  runtime-generated `CanvasTexture`s (`src/world/proceduralTextures.ts`).
- The city block is hand-authored data in `src/world/cityData.ts`.
