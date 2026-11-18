// The things that move in Sunset Bay: the player on foot, cars (civilian, parked,
// police, taxi, sports) and pedestrians. No drawing and no screens here: this file owns
// positions, speeds and the rules of driving, walking and stealing a car. The police
// chase lives in police.js and shooting in combat.js; both work on these objects.
import { CAR, GRID, PALETTE, PLAYER, POLICE_CAR, ROAD_HALF, SPORTS_CAR, TRAFFIC, WORLD } from './config.js';
import { collideBuildings, hitsBuilding, isRoad, nearestRoadLine, randomRoadPoint, randomSidewalkPoint } from './city.js';

export const CAR_CIVILIAN = 'civilian';
export const CAR_PARKED = 'parked';
export const CAR_POLICE = 'police';
export const CAR_TAXI = 'taxi';
export const CAR_SPORTS = 'sports';

let nextCarId = 1;

function pick(array, random) {
  return array[Math.floor(random() * array.length)];
}

export function makeCar(kind, x, y, angle, random) {
  const tune = kind === CAR_SPORTS ? SPORTS_CAR : kind === CAR_POLICE ? POLICE_CAR : CAR;
  return {
    id: nextCarId++,
    kind,
    x,
    y,
    angle,
    speed: 0,
    color: kind === CAR_POLICE ? PALETTE.policeBody : kind === CAR_TAXI ? PALETTE.taxiBody : pick(PALETTE.carBody, random),
    radius: 22,
    length: CAR.length,
    width: CAR.width,
    accel: tune.accel,
    maxSpeed: tune.maxSpeed,
    steerRate: tune.steerRate,
    /** Civilian traffic only: which way it drives and its lane offset. */
    heading: 0,
    lane: 0,
    /** Police only: how long it has been stuck, for giving up and respawning. */
    stuck: 0,
    /** Seconds since this car was last hit by a bullet, for the wanted system. */
    lastShot: -99,
    occupied: kind === CAR_CIVILIAN || kind === CAR_TAXI,
    /** The pedestrian driving it, if any; null for a parked car. */
    driver: null,
    dead: false,
  };
}

/** A pedestrian: walks the sidewalks, flees from danger, can be a driver. */
export function makePedestrian(x, y, random) {
  return {
    x,
    y,
    angle: random() * Math.PI * 2,
    speed: 40 + random() * 30,
    color: pick(PALETTE.pedShirt, random),
    radius: 11,
    /** walk | flee | down | drive */
    state: 'walk',
    stateTime: 0,
    /** Where a fleeing pedestrian runs to. */
    fleeX: 0,
    fleeY: 0,
    /** Cash dropped when knocked down. */
    cash: 0,
    dead: false,
  };
}

/** Starting ammo for a new game. */
export const COMBAT_AMMO_START = 36;

export function createEntities(random, city) {
  const player = {
    x: 0,
    y: 0,
    angle: -Math.PI / 2,
    aimAngle: -Math.PI / 2,
    speed: 0,
    health: PLAYER.health,
    money: 0,
    ammo: COMBAT_AMMO_START,
    inCar: null,
    invulnerable: 0,
    regenTimer: 0,
    sprinting: false,
  };
  const cars = [];
  const peds = [];
  const state = { player, cars, peds, time: 0 };
  resetEntities(state, random, city);
  return state;
}

function resetEntities(state, random, city) {
  state.cars.length = 0;
  state.peds.length = 0;
  state.time = 0;
  const p = state.player;
  p.x = 3 * GRID.pitch + 60;
  p.y = 2 * GRID.pitch + 60;
  p.angle = -Math.PI / 2;
  p.aimAngle = -Math.PI / 2;
  p.health = PLAYER.health;
  p.money = 0;
  p.ammo = COMBAT_AMMO_START;
  p.inCar = null;
  p.invulnerable = 0;
  p.regenTimer = 0;
  // The sports car at the marina, parked and waiting to be borrowed.
  const sports = makeCar(CAR_SPORTS, 10 * GRID.pitch, 8 * GRID.pitch + 30, Math.PI / 2, random);
  sports.occupied = false;
  state.cars.push(sports);
  // A taxi idling by the hotel.
  const taxi = makeCar(CAR_TAXI, 8 * GRID.pitch - 30, 3 * GRID.pitch + 28, 0, random);
  state.cars.push(taxi);
  // Parked cars along the roads, free for the taking.
  for (let i = 0; i < 10; i += 1) {
    const spot = randomRoadPoint(random);
    const line = nearestRoadLine(spot.x, spot.y);
    const car = makeCar(CAR_PARKED, spot.x, spot.y, line.axis === 'h' ? 0 : Math.PI / 2, random);
    car.occupied = false;
    // Park on the road's edge, not in the middle of the lane.
    if (line.axis === 'h') car.y = line.at + (random() < 0.5 ? -1 : 1) * (ROAD_HALF - 16);
    else car.x = line.at + (random() < 0.5 ? -1 : 1) * (ROAD_HALF - 16);
    if (!hitsBuilding(city.buildings, car.x, car.y, 26)) state.cars.push(car);
  }
  // Civilian traffic, already rolling.
  for (let i = 0; i < TRAFFIC.cars; i += 1) spawnTrafficCar(state, random, city);
  // Pedestrians on the sidewalks.
  for (let i = 0; i < TRAFFIC.pedestrians; i += 1) spawnPedestrian(state, random, city);
}

export function spawnTrafficCar(state, random, city) {
  const spot = randomRoadPoint(random);
  const line = nearestRoadLine(spot.x, spot.y);
  const car = makeCar(CAR_CIVILIAN, spot.x, spot.y, 0, random);
  if (line.axis === 'h') {
    car.heading = random() < 0.5 ? 0 : Math.PI;
    car.angle = car.heading;
    car.y = line.at + (car.heading === 0 ? 22 : -22);
  } else {
    car.heading = random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
    car.angle = car.heading;
    car.x = line.at + (car.heading === Math.PI / 2 ? -22 : 22);
  }
  car.speed = TRAFFIC.cruiseSpeed + (random() - 0.5) * TRAFFIC.cruiseJitter;
  const driver = makePedestrian(car.x, car.y, random);
  driver.state = 'drive';
  car.driver = driver;
  state.cars.push(car);
  return car;
}

export function spawnPedestrian(state, random, city) {
  const spot = randomSidewalkPoint(random);
  const ped = makePedestrian(spot.x, spot.y, random);
  state.peds.push(ped);
  return ped;
}

/** The nearest car the player could steal, within reach, or null. */
export function nearestStealableCar(state, maxDist) {
  const p = state.player;
  let best = null;
  let bestD = maxDist;
  for (const car of state.cars) {
    if (car.dead || car.kind === CAR_POLICE) continue;
    const dx = car.x - p.x;
    const dy = car.y - p.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < bestD) {
      bestD = d;
      best = car;
    }
  }
  return best;
}

/** Pull the player into a car (stealing it if it has a driver). Returns what happened. */
export function enterCar(state, car) {
  const p = state.player;
  let stole = false;
  if (car.driver) {
    const driver = car.driver;
    driver.state = 'flee';
    driver.stateTime = 0;
    driver.x = car.x + Math.cos(car.angle + Math.PI / 2) * 30;
    driver.y = car.y + Math.sin(car.angle + Math.PI / 2) * 30;
    driver.fleeX = driver.x + (driver.x - p.x);
    driver.fleeY = driver.y + (driver.y - p.y);
    state.peds.push(driver);
    car.driver = null;
    stole = true;
  }
  car.occupied = true;
  p.inCar = car;
  p.x = car.x;
  p.y = car.y;
  return { stole };
}

/** Step out of the car beside it. */
export function exitCar(state) {
  const p = state.player;
  const car = p.inCar;
  if (!car) return;
  p.inCar = null;
  p.x = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
  p.y = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
  p.angle = car.angle;
  p.aimAngle = car.angle;
}

/**
 * One step of the player's movement on foot. `move` is {x, y} (unit-ish), `sprint` a
 * boolean. The player cannot walk through buildings or leave the city.
 */
export function stepPlayerOnFoot(state, dt, move, sprint, city) {
  const p = state.player;
  const speed = sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
  const len = Math.hypot(move.x, move.y);
  if (len > 0.01) {
    p.angle = Math.atan2(move.y, move.x);
    p.x += (move.x / len) * speed * dt;
    p.y += (move.y / len) * speed * dt;
  }
  p.x = Math.max(20, Math.min(WORLD.width - 20, p.x));
  p.y = Math.max(20, Math.min(WORLD.height - 20, p.y));
  const body = { x: p.x, y: p.y, radius: PLAYER.radius };
  collideBuildings(city.buildings, body);
  p.x = body.x;
  p.y = body.y;
  if (p.invulnerable > 0) p.invulnerable = Math.max(0, p.invulnerable - dt);
  if (p.regenTimer > 0) p.regenTimer -= dt;
  else if (p.health < PLAYER.health) p.health = Math.min(PLAYER.health, p.health + PLAYER.regenRate * dt);
}

/**
 * Drive a car one step. `throttle` -1..1 (reverse to forward), `steer` -1..1 (left to
 * right), `handbrake` cuts the grip so the car slides. Returns true when the car hit a
 * building this step.
 */
export function stepCarPhysics(car, dt, throttle, steer, handbrake, city) {
  const grip = handbrake ? 0.6 : CAR.grip;
  if (throttle > 0) car.speed += car.accel * throttle * dt;
  else if (throttle < 0) {
    if (car.speed > 5) car.speed += CAR.brake * throttle * dt;
    else car.speed += CAR.reverseAccel * throttle * dt;
  } else {
    car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 240 * dt);
  }
  if (car.speed > car.maxSpeed) car.speed = car.maxSpeed;
  if (car.speed < -CAR.maxReverse) car.speed = -CAR.maxReverse;
  const turn = steer * car.steerRate * Math.min(1, Math.abs(car.speed) / 160) * grip * 0.32;
  car.angle += turn * Math.sign(car.speed) * dt * 3.2;
  car.x += Math.cos(car.angle) * car.speed * dt;
  car.y += Math.sin(car.angle) * car.speed * dt;
  car.x = Math.max(24, Math.min(WORLD.width - 24, car.x));
  car.y = Math.max(24, Math.min(WORLD.height - 24, car.y));
  const body = { x: car.x, y: car.y, radius: car.radius };
  const hit = collideBuildings(city.buildings, body);
  car.x = body.x;
  car.y = body.y;
  if (hit && Math.abs(car.speed) > 120) car.speed *= 0.45;
  return hit;
}

/** Keep two cars from overlapping: push them apart and trade a little speed. */
export function separateCars(cars) {
  for (let i = 0; i < cars.length; i += 1) {
    const a = cars[i];
    if (a.dead) continue;
    for (let j = i + 1; j < cars.length; j += 1) {
      const b = cars[j];
      if (b.dead) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const d = Math.hypot(dx, dy);
      const min = a.radius + b.radius - 6;
      if (d >= min || d === 0) continue;
      const push = (min - d) / 2 / d;
      a.x -= dx * push;
      a.y -= dy * push;
      b.x += dx * push;
      b.y += dy * push;
      const avg = (a.speed + b.speed) / 2;
      a.speed = avg * 0.9;
      b.speed = avg * 0.9;
    }
  }
}

function carAhead(state, car, dist) {
  const fx = Math.cos(car.heading);
  const fy = Math.sin(car.heading);
  let best = null;
  let bestD = dist;
  for (const other of state.cars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const along = dx * fx + dy * fy;
    if (along <= 0 || along > bestD) continue;
    const side = Math.abs(-dx * fy + dy * fx);
    if (side < 34 && along < bestD) {
      bestD = along;
      best = other;
    }
  }
  return best;
}

/**
 * Civilian traffic: cruise along the road, slow for the car ahead, and at an
 * intersection pick a new direction (mostly straight, sometimes a turn).
 */
export function stepTraffic(state, dt, random, city) {
  for (const car of state.cars) {
    if (car.dead || car === state.player.inCar) continue;
    if (car.kind !== CAR_CIVILIAN && car.kind !== CAR_TAXI) continue;
    if (car.driver === null) continue;
    const ahead = carAhead(state, car, 110);
    const target = ahead ? Math.max(0, ahead.speed - 20) : TRAFFIC.cruiseSpeed;
    if (car.speed < target) car.speed = Math.min(target, car.speed + 200 * dt);
    else if (car.speed > target) car.speed = Math.max(target, car.speed - 500 * dt);
    // At an intersection (near a crossing road line), maybe turn.
    const line = nearestRoadLine(car.x, car.y);
    const onRoad = line.axis === 'h'
      ? Math.abs(car.y - line.at) < 6 && Math.abs(car.x % GRID.pitch) < 40
      : Math.abs(car.x - line.at) < 6 && Math.abs(car.y % GRID.pitch) < 40;
    if (onRoad) {
      const key = `${Math.round(car.x / GRID.pitch)}:${Math.round(car.y / GRID.pitch)}`;
      if (car.lastTurn !== key) {
        car.lastTurn = key;
        const roll = random();
        if (roll > 0.72) {
          // Turn left or right.
          const left = roll > 0.86;
          car.heading += left ? -Math.PI / 2 : Math.PI / 2;
          car.heading = ((car.heading % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        }
      }
    }
    // Ease the angle toward the heading and roll forward.
    let diff = car.heading - car.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    car.angle += Math.max(-2.4 * dt, Math.min(2.4 * dt, diff));
    const fx = Math.cos(car.angle);
    const fy = Math.sin(car.angle);
    car.x += fx * car.speed * dt;
    car.y += fy * car.speed * dt;
    // Nudge back onto the lane: drift toward the road centre line for this heading.
    const roadLine = nearestRoadLine(car.x, car.y);
    if (car.heading === 0 || car.heading === Math.PI) {
      const want = roadLine.at + (car.heading === 0 ? 22 : -22);
      car.y += (want - car.y) * Math.min(1, 1.5 * dt);
    } else {
      const want = roadLine.at + (car.heading === Math.PI / 2 ? -22 : 22);
      car.x += (want - car.x) * Math.min(1, 1.5 * dt);
    }
    const body = { x: car.x, y: car.y, radius: car.radius };
    collideBuildings(city.buildings, body);
    car.x = body.x;
    car.y = body.y;
    if (car.driver) {
      car.driver.x = car.x;
      car.driver.y = car.y;
    }
  }
}

/**
 * Pedestrians: walk the sidewalks, turn at intersections, flee from danger (a fast car,
 * a gunshot, or the player running at them). A downed pedestrian gets up after a while.
 */
export function stepPedestrians(state, dt, random, danger, city) {
  for (const ped of state.peds) {
    if (ped.dead || ped.state === 'drive') continue;
    ped.stateTime += dt;
    if (ped.state === 'down') {
      if (ped.stateTime > 10) {
        ped.state = 'flee';
        ped.stateTime = 0;
        ped.fleeX = ped.x + (ped.x - danger.x);
        ped.fleeY = ped.y + (ped.y - danger.y);
      }
      continue;
    }
    if (ped.state === 'flee') {
      const dx = ped.fleeX - ped.x;
      const dy = ped.fleeY - ped.y;
      const d = Math.hypot(dx, dy);
      if (d > 12) {
        ped.angle = Math.atan2(dy, dx);
        ped.x += Math.cos(ped.angle) * ped.speed * 2.1 * dt;
        ped.y += Math.sin(ped.angle) * ped.speed * 2.1 * dt;
      } else if (ped.stateTime > 4) {
        ped.state = 'walk';
        ped.stateTime = 0;
      }
      ped.x = Math.max(20, Math.min(WORLD.width - 20, ped.x));
      ped.y = Math.max(20, Math.min(WORLD.height - 20, ped.y));
      continue;
    }
    // Walking: keep to the sidewalk beside the nearest road; turn at intersections.
    const dangerDx = ped.x - danger.x;
    const dangerDy = ped.y - danger.y;
    if (danger.active && dangerDx * dangerDx + dangerDy * dangerDy < 240 * 240) {
      ped.state = 'flee';
      ped.stateTime = 0;
      ped.fleeX = ped.x + dangerDx;
      ped.fleeY = ped.y + dangerDy;
      continue;
    }
    const line = nearestRoadLine(ped.x, ped.y);
    const onSidewalk = isRoad(ped.x, ped.y) === false;
    if (onSidewalk && random() < dt * 0.08) {
      ped.angle += (random() < 0.5 ? -1 : 1) * Math.PI / 2;
    }
    ped.x += Math.cos(ped.angle) * ped.speed * dt;
    ped.y += Math.sin(ped.angle) * ped.speed * dt;
    ped.x = Math.max(20, Math.min(WORLD.width - 20, ped.x));
    ped.y = Math.max(20, Math.min(WORLD.height - 20, ped.y));
    const body = { x: ped.x, y: ped.y, radius: ped.radius };
    collideBuildings(city.buildings, body);
    ped.x = body.x;
    ped.y = body.y;
  }
  // Keep the streets populated: replace pedestrians who wandered off or were removed.
  const alive = state.peds.filter((p) => !p.dead && p.state !== 'drive').length;
  if (alive < TRAFFIC.pedestrians && random() < dt * 0.5) spawnPedestrian(state, random, null);
}
