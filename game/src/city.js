// The city of Sunset Bay: a grid of streets, blocks of buildings, a park, a beach along
// the south shore and docks on the east edge. Generation is deterministic for a seed, so a
// screenshot scene always stages the same streets. No drawing here: this file only builds
// the data (roads, buildings, places) and answers questions about it (is this a road? what
// building is here? where can a car drive?).
import { BLOCK, GRID, PALETTE, ROAD_HALF, WORLD } from './config.js';

const ROAD_COUNT_X = Math.floor(WORLD.width / GRID.pitch) + 1;
const ROAD_COUNT_Y = Math.floor(WORLD.height / GRID.pitch) + 1;

/** Road centre lines, in world units. */
export const ROAD_X = [];
for (let i = 0; i < ROAD_COUNT_X; i += 1) ROAD_X.push(i * GRID.pitch);
export const ROAD_Y = [];
for (let j = 0; j < ROAD_COUNT_Y; j += 1) ROAD_Y.push(j * GRID.pitch);

/** The park block (bx, by) and the docks strip along the east edge. */
export const PARK_BLOCK = { bx: 5, by: 4 };
export const BEACH_Y = WORLD.height - 130;
export const DOCKS_X = WORLD.width - 150;

/** A place the HUD and missions can point at: a name and a point on the map. */
export const PLACES = {
  garage: { name: 'Harborlight Garage', x: ROAD_X[2] + 40, y: ROAD_Y[2] + 40 },
  hotel: { name: 'Bluefin Hotel', x: ROAD_X[8], y: ROAD_Y[3] },
  motel: { name: 'Palms Motel', x: ROAD_X[4], y: ROAD_Y[7] },
  docks: { name: 'Coral Docks', x: DOCKS_X - 60, y: ROAD_Y[6] },
  marina: { name: 'Marina Point', x: ROAD_X[10], y: ROAD_Y[8] },
  hospital: { name: 'St. Anselm Hospital', x: ROAD_X[6], y: ROAD_Y[2] },
  casino: { name: 'Golden Gull Casino', x: ROAD_X[9], y: ROAD_Y[5] },
  park: { name: 'Palm Court Park', x: ROAD_X[5] + GRID.pitch / 2, y: ROAD_Y[4] + GRID.pitch / 2 },
};

/** Roof colours: warm terracotta and sand, with a few cool slate and sage roofs. */
const ROOF_COLORS = ['#b98a5e', '#a87c5a', '#8a9ba8', '#7d8a99', '#c2a878', '#96705a', '#6f8f7a', '#b56a4e'];

/**
 * A building: a rectangle with a roof colour, a height (drawn as a shadow offset) and a
 * name for the few the story points at. Buildings never sit on a road.
 */
export function buildCity(random) {
  const buildings = [];
  const trees = [];
  for (let bx = 0; bx < ROAD_COUNT_X - 1; bx += 1) {
    for (let by = 0; by < ROAD_COUNT_Y - 1; by += 1) {
      const x0 = ROAD_X[bx] + ROAD_HALF + GRID.sidewalk;
      const y0 = ROAD_Y[by] + ROAD_HALF + GRID.sidewalk;
      const x1 = ROAD_X[bx + 1] - ROAD_HALF - GRID.sidewalk;
      const y1 = ROAD_Y[by + 1] - ROAD_HALF - GRID.sidewalk;
      if (bx === PARK_BLOCK.bx && by === PARK_BLOCK.by) {
        for (let t = 0; t < 14; t += 1) {
          trees.push({
            x: x0 + 20 + random() * (x1 - x0 - 40),
            y: y0 + 20 + random() * (y1 - y0 - 40),
            r: 12 + random() * 10,
          });
        }
        continue;
      }
      if (x0 > DOCKS_X - 40) continue;
      // One or two buildings per block, leaving a plaza gap between them.
      const split = random() < 0.55;
      const parts = split ? 2 : 1;
      for (let p = 0; p < parts; p += 1) {
        const w = (x1 - x0) / parts;
        const bx0 = x0 + p * w + 8;
        const by0 = y0 + 8;
        const bw = w - 16;
        const bh = y1 - y0 - 16;
        if (bw < 30 || bh < 30) continue;
        const hue = Math.floor(random() * 360);
        buildings.push({
          x: bx0,
          y: by0,
          width: bw,
          height: bh,
          roof: ROOF_COLORS[Math.floor(random() * ROOF_COLORS.length)],
          glass: random() < 0.5,
          shade: 4 + random() * 8,
          hue,
        });
      }
    }
  }
  // The beach strip: palm trees along the sand.
  for (let x = 60; x < WORLD.width - 60; x += 90) {
    trees.push({ x: x + (random() - 0.5) * 40, y: BEACH_Y + 46 + random() * 50, r: 14 + random() * 8, palm: true });
  }
  return { buildings, trees };
}

/** True when the point is on a road surface (not sidewalk, not a block). */
export function isRoad(x, y) {
  if (x < 0 || y < 0 || x > WORLD.width || y > WORLD.height) return false;
  for (const rx of ROAD_X) if (Math.abs(x - rx) <= ROAD_HALF) return true;
  for (const ry of ROAD_Y) if (Math.abs(y - ry) <= ROAD_HALF) return true;
  return false;
}

/** True when the point is on a sidewalk strip beside a road. */
export function isSidewalk(x, y) {
  if (x < 0 || y < 0 || x > WORLD.width || y > WORLD.height) return false;
  const band = ROAD_HALF + GRID.sidewalk;
  for (const rx of ROAD_X) {
    const d = Math.abs(x - rx);
    if (d > ROAD_HALF && d <= band) return true;
  }
  for (const ry of ROAD_Y) {
    const d = Math.abs(y - ry);
    if (d > ROAD_HALF && d <= band) return true;
  }
  return false;
}

/** The nearest point on a road centre line to (x, y). */
export function nearestRoadPoint(x, y) {
  let bestX = ROAD_X[0];
  let best = Math.abs(x - ROAD_X[0]);
  for (const rx of ROAD_X) {
    const d = Math.abs(x - rx);
    if (d < best) {
      best = d;
      bestX = rx;
    }
  }
  let bestY = ROAD_Y[0];
  best = Math.abs(y - ROAD_Y[0]);
  for (const ry of ROAD_Y) {
    const d = Math.abs(y - ry);
    if (d < best) {
      best = d;
      bestY = ry;
    }
  }
  // Keep the nearer of the two axes: the closest road runs that way.
  return Math.abs(x - bestX) < Math.abs(y - bestY) ? { x: bestX, y } : { x, y: bestY };
}

/** The road centre line (x or y) nearest to the point, and which way it runs. */
export function nearestRoadLine(x, y) {
  let bestX = ROAD_X[0];
  let best = Math.abs(x - ROAD_X[0]);
  for (const rx of ROAD_X) {
    const d = Math.abs(x - rx);
    if (d < best) {
      best = d;
      bestX = rx;
    }
  }
  let bestY = ROAD_Y[0];
  best = Math.abs(y - ROAD_Y[0]);
  for (const ry of ROAD_Y) {
    const d = Math.abs(y - ry);
    if (d < best) {
      best = d;
      bestY = ry;
    }
  }
  return Math.abs(x - bestX) < Math.abs(y - bestY)
    ? { axis: 'v', at: bestX }
    : { axis: 'h', at: bestY };
}

/**
 * Push a circle (x, y, radius) out of every building it overlaps. Returns true when a
 * building was hit, so cars can take damage and make a sound from it.
 */
export function collideBuildings(buildings, body) {
  let hit = false;
  for (let i = 0; i < buildings.length; i += 1) {
    const b = buildings[i];
    const cx = Math.max(b.x, Math.min(body.x, b.x + b.width));
    const cy = Math.max(b.y, Math.min(body.y, b.y + b.height));
    const dx = body.x - cx;
    const dy = body.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= body.radius * body.radius) continue;
    hit = true;
    if (d2 === 0) {
      body.x += body.radius;
      continue;
    }
    const d = Math.sqrt(d2);
    const push = (body.radius - d) / d;
    body.x += dx * push;
    body.y += dy * push;
  }
  return hit;
}

/** True when a circle overlaps any building. */
export function hitsBuilding(buildings, x, y, radius) {
  for (let i = 0; i < buildings.length; i += 1) {
    const b = buildings[i];
    const cx = Math.max(b.x, Math.min(x, b.x + b.width));
    const cy = Math.max(b.y, Math.min(y, b.y + b.height));
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy < radius * radius) return true;
  }
  return false;
}

/** A random point on a road, for spawning traffic and pickups. */
export function randomRoadPoint(random) {
  if (random() < 0.5) {
    return {
      x: ROAD_X[Math.floor(random() * ROAD_X.length)],
      y: random() * WORLD.height,
    };
  }
  return {
    x: random() * WORLD.width,
    y: ROAD_Y[Math.floor(random() * ROAD_Y.length)],
  };
}

/** A random point on a sidewalk, for spawning pedestrians. */
export function randomSidewalkPoint(random) {
  const p = randomRoadPoint(random);
  const off = ROAD_HALF + GRID.sidewalk / 2;
  if (random() < 0.5) return { x: p.x + (random() < 0.5 ? -off : off), y: p.y };
  return { x: p.x, y: p.y + (random() < 0.5 ? -off : off) };
}
