// The screenshot scenes behind ?shot=cover|foot|chase|start. Each one resets the world
// from the seed and plays the real rules forward for a fixed time, steered by a simple
// autopilot that drives along the road grid toward its target, so the frame is what a
// short game really looks like and the same seed always gives the same frame.
import { GRID, STEP } from './config.js';
import { PLACES, nearestRoadLine } from './city.js';
import { enterCar } from './entities.js';
import { addWanted } from './police.js';
import { startMission } from './missions.js';
import { resetGame, stepGame } from './game.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

function wrapAngle(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

/** The empty control state, for steps where the autopilot does nothing. */
function idleControl() {
  return {
    moveX: 0, moveY: 0, sprint: false, throttle: 0, steer: 0, handbrake: false,
    enter: false, reload: false, shooting: false, aimX: 0, aimY: 0, muted: true,
  };
}

/**
 * Drive the player's car toward (tx, ty) along the road grid: first along the current
 * road to the target's street, then down that street to the target. Returns the control
 * for one step.
 */
function driveToward(game, tx, ty) {
  const car = game.player.inCar;
  if (!car) return idleControl();
  const line = nearestRoadLine(car.x, car.y);
  let wx;
  let wy;
  if (Math.abs(car.x - tx) > 60) {
    wx = tx;
    wy = line.axis === 'h' ? line.at : car.y;
  } else {
    wx = tx;
    wy = ty;
  }
  const desired = Math.atan2(wy - car.y, wx - car.x);
  const diff = wrapAngle(desired - car.angle);
  return {
    ...idleControl(),
    throttle: Math.abs(diff) > 1.5 ? 0.25 : 1,
    steer: clamp(diff * 2.2, -1, 1),
  };
}

/** Walk the player toward (tx, ty). */
function walkToward(game, tx, ty) {
  const p = game.player;
  const dx = tx - p.x;
  const dy = ty - p.y;
  const d = Math.hypot(dx, dy);
  if (d < 12) return idleControl();
  return { ...idleControl(), moveX: dx / d, moveY: dy / d };
}

function simulate(game, seconds, controlFor) {
  const steps = Math.round(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    stepGame(game, STEP, controlFor(game));
    game.events.length = 0;
  }
}

/** The cover: driving the mission route at dusk, wanted, mission on the HUD. */
function stageCover(game) {
  resetGame(game);
  startMission(game.missions, game.wanted);
  const taxi = game.cars.find((c) => c.kind === 'taxi');
  // The taxi waits at the garage: the drive follows mission 1's route to the hotel.
  taxi.x = PLACES.garage.x + 46;
  taxi.y = PLACES.garage.y + 40;
  taxi.angle = 0;
  enterCar(game.entities, taxi);
  addWanted(game.wanted, 2);
  game.mouse.seen = false;
  simulate(game, 7, (g) => driveToward(g, PLACES.hotel.x, PLACES.hotel.y));
  return { screen: SCREEN_PLAY, ui: { best: 0, hasSave: false, fine: 0 } };
}

/** On foot by the mission marker, pedestrians around, a car waiting to be stolen. */
function stageFoot(game) {
  resetGame(game);
  startMission(game.missions, game.wanted);
  const p = game.player;
  p.x = PLACES.garage.x - 500;
  p.y = PLACES.garage.y + 60;
  const parked = game.cars.find((c) => c.kind === 'parked');
  if (parked) {
    parked.x = PLACES.garage.x + 110;
    parked.y = PLACES.garage.y + 34;
    parked.angle = 0;
  }
  game.mouse.seen = false;
  // Walk part of the way so the mission marker is still ahead of the player.
  simulate(game, 1.5, (g) => walkToward(g, PLACES.garage.x, PLACES.garage.y));
  return { screen: SCREEN_PLAY, ui: { best: 0, hasSave: false, fine: 0 } };
}

/** A police chase: a clean getaway first, then the heat arrives. */
function stageChase(game) {
  resetGame(game);
  const sports = game.cars.find((c) => c.kind === 'sports');
  enterCar(game.entities, sports);
  game.mouse.seen = false;
  // Four seconds of open road, then mission 3 starts and the cruisers close in.
  simulate(game, 4, (g) => driveToward(g, PLACES.casino.x, PLACES.casino.y));
  game.missions.index = 2;
  startMission(game.missions, game.wanted);
  addWanted(game.wanted, 1);
  simulate(game, 3, (g) => driveToward(g, PLACES.casino.x, PLACES.casino.y));
  return { screen: SCREEN_PLAY, ui: { best: 0, hasSave: false, fine: 0 } };
}

/** The title screen over a living city: traffic rolling behind the panel. */
function stageStart(game) {
  resetGame(game);
  game.mouse.seen = false;
  simulate(game, 7, () => idleControl());
  return { screen: SCREEN_TITLE, ui: { best: 1250, hasSave: true, fine: 0 } };
}

/**
 * Set `game` to the named scene (cover, foot, chase or start; any other name is start)
 * and return the screen to draw over it and the panel values to show.
 */
export function stageShot(name, game) {
  if (name === 'cover') return stageCover(game);
  if (name === 'foot') return stageFoot(game);
  if (name === 'chase') return stageChase(game);
  return stageStart(game);
}
