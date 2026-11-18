// The wanted level and the Sunset Bay police. Crimes raise stars; stars bring police
// cars that chase, ram and try to pin the player down. Lose them (or wait it out) and
// the heat fades. Get caught and it is over: a fine, the stars clear, and the player
// wakes up at the hospital.
import { PLAYER, POLICE, WANTED } from './config.js';
import { CAR_POLICE, makeCar, stepCarPhysics } from './entities.js';
import { nearestRoadPoint } from './city.js';

/** The wanted state: stars 0-5, a bust timer and a decay timer. */
export function createWanted() {
  return { stars: 0, bust: 0, decay: 0, pinTime: 0 };
}

/** Add stars for a crime, up to the maximum. Returns the new star count. */
export function addWanted(wanted, stars) {
  wanted.stars = Math.min(WANTED.max, wanted.stars + stars);
  wanted.decay = 0;
  return wanted.stars;
}

/** Clear the wanted level (after a bust or a mission that ends the heat). */
export function clearWanted(wanted) {
  wanted.stars = 0;
  wanted.bust = 0;
  wanted.pinTime = 0;
  wanted.decay = 0;
}

/**
 * One step of the wanted system: keep the right number of police cars on the street,
 * decay stars when the player is quiet and unseen, and work out whether the player is
 * being pinned down for a bust. `police` is the array of police cars in the world.
 * Returns 'busted' when the bust lands, else null.
 */
export function stepWanted(state, dt, random, city) {
  const wanted = state.wanted;
  const player = state.player;
  const police = state.police;

  // Keep the street staffed: one police car per star.
  const wantCount = Math.min(WANTED.max, wanted.stars * WANTED.carsPerStar);
  while (police.length < wantCount) {
    const spot = spawnSpot(state, random);
    const car = makeCar(CAR_POLICE, spot.x, spot.y, 0, random);
    car.speed = 200;
    police.push(car);
    state.cars.push(car);
  }
  while (police.length > wantCount) {
    const car = police.pop();
    car.dead = true;
  }
  // Drop dead cars in place so every reference to the array stays valid.
  for (let i = state.cars.length - 1; i >= 0; i -= 1) {
    if (state.cars[i].dead) state.cars.splice(i, 1);
  }

  if (wanted.stars === 0) return null;

  // Decay: quiet for long enough, with no police car in sight, and a star fades.
  const nearest = nearestPoliceDistance(state);
  if (nearest > WANTED.sightRange) {
    wanted.decay += dt;
    if (wanted.decay >= WANTED.decaySeconds) {
      wanted.stars -= 1;
      wanted.decay = 0;
    }
  } else {
    wanted.decay = 0;
  }

  // Busted: on foot, a police car sitting on the player; in a car, pinned slow with a
  // police car right beside them.
  const onFoot = player.inCar === null;
  let pinning = false;
  for (const car of police) {
    const dx = car.x - player.x;
    const dy = car.y - player.y;
    const d = Math.hypot(dx, dy);
    if (onFoot) {
      if (d < 46) pinning = true;
    } else if (Math.abs(player.inCar.speed) < POLICE.pinSpeed && d < POLICE.pinRange) {
      pinning = true;
    }
  }
  if (pinning) {
    wanted.pinTime += dt;
    if (wanted.pinTime >= POLICE.bustSeconds) return 'busted';
  } else {
    wanted.pinTime = Math.max(0, wanted.pinTime - dt * 2);
  }
  return null;
}

/** Distance from the player to the nearest police car (Infinity when none). */
export function nearestPoliceDistance(state) {
  let best = Infinity;
  for (const car of state.police) {
    const dx = car.x - state.player.x;
    const dy = car.y - state.player.y;
    const d = Math.hypot(dx, dy);
    if (d < best) best = d;
  }
  return best;
}

/** A spawn point for a new police car: on a road, a few blocks from the player. */
function spawnSpot(state, random) {
  const p = state.player;
  for (let tries = 0; tries < 12; tries += 1) {
    const spot = nearestRoadPoint(p.x + (random() - 0.5) * 1400, p.y + (random() - 0.5) * 1400);
    const dx = spot.x - p.x;
    const dy = spot.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d > 420 && d < 900) return spot;
  }
  return { x: Math.max(60, p.x - 500), y: p.y };
}

/**
 * Police driving: steer toward the player, cut corners across blocks when close, ram
 * when in reach. A stuck police car (wedged on a building) gives up and respawns.
 */
export function stepPolice(state, dt, random, city) {
  const player = state.player;
  for (const car of state.police) {
    if (car.dead) continue;
    const dx = player.x - car.x;
    const dy = player.y - car.y;
    const dist = Math.hypot(dx, dy);
    const wantAngle = Math.atan2(dy, dx);
    let diff = wantAngle - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 1.6));
    // Chase hard, but ease off the throttle when right on top of the player so the
    // ram lands instead of an overshoot.
    const throttle = dist > 120 ? 1 : 0.55;
    const before = { x: car.x, y: car.y };
    stepCarPhysics(car, dt, throttle, steer, false, city);
    const moved = Math.hypot(car.x - before.x, car.y - before.y);
    if (Math.abs(car.speed) > 80 && moved < 0.4) {
      car.stuck += dt;
    } else {
      car.stuck = 0;
    }
    if (car.stuck > POLICE.stuckSeconds) {
      const spot = spawnSpot(state, random);
      car.x = spot.x;
      car.y = spot.y;
      car.angle = Math.atan2(player.y - spot.y, player.x - spot.x);
      car.speed = 240;
      car.stuck = 0;
    }
    // Ramming the player's car hurts it and shoves it.
    if (player.inCar && dist < car.radius + player.inCar.radius - 4) {
      const push = 160 * dt;
      player.inCar.x += (dx / (dist || 1)) * push * 0.4;
      player.inCar.speed *= 0.985;
      car.speed *= 0.9;
    }
    // Ramming the player on foot hurts them.
    if (!player.inCar && dist < car.radius + 14 && player.invulnerable === 0) {
      player.health -= 18;
      player.invulnerable = 1;
      player.regenTimer = PLAYER.regenDelay;
      state.events.push({ type: 'player-hit', amount: 18 });
    }
  }
}
