// The simulation core: one game object holding every system, and stepGame(), the
// single function that advances it one fixed step. main.js calls it from the loop with
// live input; shots.js calls it with scripted input to stage screenshots. No drawing
// and no DOM here except the save: this file only moves the world and reports events.
import { COMBAT, MONEY, PALETTE, PLAYER, STEP, WANTED } from './config.js';
import { createRandom } from './random.js';
import { buildCity, PLACES } from './city.js';
import {
  CAR_POLICE,
  createEntities,
  enterCar,
  exitCar,
  nearestStealableCar,
  separateCars,
  stepCarPhysics,
  stepPedestrians,
  stepPlayerOnFoot,
  stepTraffic,
} from './entities.js';
import { addWanted, clearWanted, createWanted, stepPolice, stepWanted } from './police.js';
import { createMissionState, currentMission, retryMission, startMission, stepMissions } from './missions.js';
import { createCombat, firePistol, startReload, stepCombat } from './combat.js';
import { createAudio, setMuted, sfxBusted, sfxCrash, sfxMission, sfxPickup, sfxShot, updateAudio } from './audio.js';
import { loadGame, saveBest, saveGame } from './save.js';

/** A fresh game for a seed: city, entities, wanted level, missions, combat, audio. */
export function createGame(seed) {
  const random = createRandom(seed);
  const city = buildCity(random);
  const entities = createEntities(random, city);
  const game = {
    seed,
    random,
    city,
    entities,
    player: entities.player,
    cars: entities.cars,
    peds: entities.peds,
    police: [],
    wanted: createWanted(),
    missions: createMissionState(),
    combat: createCombat(random),
    audio: createAudio(),
    particles: [],
    events: [],
    time: 0,
    shake: 0,
    /** The live danger point pedestrians flee from (gunfire, a speeding car). */
    danger: { x: 0, y: 0, active: false },
    /** Where the mouse is in world units, for aiming. */
    aimWorld: { x: 0, y: 0 },
    mouse: { x: 0, y: 0, seen: false },
  };
  return game;
}

/** Rebuild the world from the seed, so a screenshot scene stages identically. */
export function resetGame(game) {
  const fresh = createGame(game.seed);
  for (const key of Object.keys(fresh)) game[key] = fresh[key];
}

/** Put a save back into a fresh game: money, mission, position, health, ammo. */
export function applySave(game, save) {
  const p = game.player;
  p.money = save.money;
  p.health = save.health;
  p.ammo = save.ammo;
  p.x = save.x;
  p.y = save.y;
  game.missions.index = Math.min(save.missionIndex, 5);
  game.missions.stage = 0;
  game.time = save.time || 0;
  startMission(game.missions, game.wanted);
}

/** The player's car, or null when on foot. */
export function playerCar(game) {
  return game.player.inCar;
}

function burst(game, x, y, color, count, speed) {
  for (let i = 0; i < count; i += 1) {
    const a = game.random() * Math.PI * 2;
    const v = speed * (0.4 + game.random() * 0.8);
    game.particles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: 0.5,
      maxLife: 0.5,
      color,
      size: 3 + game.random() * 3,
    });
  }
}

function stepParticles(game, dt) {
  for (let i = game.particles.length - 1; i >= 0; i -= 1) {
    const pt = game.particles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.vx *= 0.92;
    pt.vy *= 0.92;
    pt.life -= dt;
    if (pt.life <= 0) game.particles.splice(i, 1);
  }
  if (game.shake > 0) game.shake = Math.max(0, game.shake - dt * 30);
}

/** A traffic car hitting the player on foot: damage and a shove. */
function checkCarHitsPlayer(game) {
  const p = game.player;
  if (p.inCar || p.invulnerable > 0) return;
  for (const car of game.cars) {
    if (car.dead || Math.abs(car.speed) < 120) continue;
    const dx = car.x - p.x;
    const dy = car.y - p.y;
    if (dx * dx + dy * dy < (car.radius + 12) * (car.radius + 12)) {
      p.health -= 20;
      p.invulnerable = 1.2;
      p.regenTimer = PLAYER.regenDelay;
      game.events.push({ type: 'player-hit', amount: 20 });
      const d = Math.hypot(dx, dy) || 1;
      p.x -= (dx / d) * 26;
      p.y -= (dy / d) * 26;
      break;
    }
  }
}

/** The player's car running someone down: a crime, and a cash drop sometimes. */
function checkCarHitsPeds(game) {
  const car = game.player.inCar;
  if (!car || Math.abs(car.speed) < 150) return;
  for (const ped of game.peds) {
    if (ped.dead || ped.state === 'down' || ped.state === 'drive') continue;
    const dx = ped.x - car.x;
    const dy = ped.y - car.y;
    if (dx * dx + dy * dy < (car.radius + ped.radius) * (car.radius + ped.radius)) {
      ped.state = 'down';
      ped.stateTime = 0;
      addWanted(game.wanted, WANTED.hitPedestrian);
      game.events.push({ type: 'ped-run-over', x: ped.x, y: ped.y });
      burst(game, ped.x, ped.y, PALETTE.blood, 10, 120);
      if (game.random() < COMBAT.pedDropChance) {
        game.combat.pickups.push({ kind: 'cash', x: ped.x, y: ped.y, amount: COMBAT.pedDropCash, bob: 0 });
      }
    }
  }
}

/** The bust: fined, dumped at the hospital, heat cleared, police sent home. */
function bustPlayer(game) {
  const p = game.player;
  const fine = Math.min(Math.round(p.money), MONEY.bustFine);
  p.money -= fine;
  if (p.inCar) {
    const car = p.inCar;
    car.speed = 0;
    exitCar(game.entities);
    p.x = PLACES.hospital.x;
    p.y = PLACES.hospital.y;
  } else {
    p.x = PLACES.hospital.x;
    p.y = PLACES.hospital.y;
  }
  p.health = Math.max(p.health, 50);
  clearWanted(game.wanted);
  for (const car of game.police) car.dead = true;
  game.police.length = 0;
  game.events.push({ type: 'busted', fine });
  saveGame(game);
}

/** Wasted: dumped at the hospital with full health and a lighter wallet. */
function wastePlayer(game) {
  const p = game.player;
  p.money = Math.max(0, p.money - 100);
  if (p.inCar) exitCar(game.entities);
  p.x = PLACES.hospital.x;
  p.y = PLACES.hospital.y;
  p.health = PLAYER.health;
  p.invulnerable = 2;
  game.events.push({ type: 'wasted' });
  saveGame(game);
}

/**
 * One fixed step. `ctl` is the control state for this step:
 * { moveX, moveY, sprint, throttle, steer, handbrake, enter, reload, shooting,
 *   aimX, aimY, muted } — live input builds it from the keyboard and mouse, the
 * screenshot stager builds it from an autopilot.
 */
export function stepGame(game, dt, ctl) {
  game.time += dt;
  const p = game.player;
  const audio = game.audio;

  if (ctl.muted !== undefined && ctl.muted !== audio.muted) setMuted(audio, ctl.muted);

  // Aim: toward the mouse when it has moved, else along the way the player faces.
  if (game.mouse.seen) {
    p.aimAngle = Math.atan2(ctl.aimY - p.y, ctl.aimX - p.x);
  }

  // Entering and leaving cars.
  if (ctl.enter) {
    if (p.inCar) {
      exitCar(game.entities);
      game.events.push({ type: 'exit-car' });
    } else {
      const car = nearestStealableCar(game.entities, 64);
      if (car) {
        const { stole } = enterCar(game.entities, car);
        if (stole) {
          addWanted(game.wanted, WANTED.stealCar);
          game.events.push({ type: 'steal', x: car.x, y: car.y });
        } else {
          game.events.push({ type: 'enter-car' });
        }
      }
    }
  }

  // Driving or walking.
  if (p.inCar) {
    const car = p.inCar;
    const hit = stepCarPhysics(car, dt, ctl.throttle, ctl.steer, ctl.handbrake, game.city);
    if (hit && Math.abs(car.speed) > 200) {
      game.shake = Math.min(14, game.shake + 6);
      game.events.push({ type: 'crash', x: car.x, y: car.y });
    }
    p.x = car.x;
    p.y = car.y;
    p.angle = car.angle;
  } else {
    stepPlayerOnFoot(game.entities, dt, { x: ctl.moveX, y: ctl.moveY }, ctl.sprint, game.city);
    if (ctl.reload) startReload(game.combat, p);
    if (ctl.shooting) {
      if (firePistol(game.combat, p, p.aimAngle, game.time)) {
        game.events.push({ type: 'shot', x: p.x, y: p.y });
        game.danger = { x: p.x, y: p.y, active: true };
        game.shake = Math.min(6, game.shake + 1.5);
      } else if (p.ammo === 0 && game.combat.reloading <= 0) {
        startReload(game.combat, p);
      }
    }
  }

  separateCars(game.cars);
  stepTraffic(game.entities, dt, game.random, game.city);
  game.danger.active = ctl.shooting || (p.inCar && Math.abs(p.inCar.speed) > 300);
  game.danger.x = p.x;
  game.danger.y = p.y;
  stepPedestrians(game.entities, dt, game.random, game.danger, game.city);
  checkCarHitsPlayer(game);
  checkCarHitsPeds(game);

  const busted = stepWanted(game, dt, game.random, game.city);
  stepPolice(game, dt, game.random, game.city);
  stepCombat(game.combat, game, dt);

  // Missions.
  const missionResult = stepMissions(game.missions, game, dt);
  if (missionResult === 'mission-done' || missionResult === 'story-done') {
    game.events.push({ type: missionResult });
    saveGame(game);
    if (missionResult === 'story-done') saveBest(p.money);
  } else if (missionResult === 'failed') {
    retryMission(game.missions, game.wanted);
    game.events.push({ type: 'mission-failed' });
  }

  if (busted === 'busted') {
    bustPlayer(game);
  } else if (p.health <= 0) {
    wastePlayer(game);
  }

  stepParticles(game, dt);

  // Sounds follow the state: engine, siren, and the one-shot events.
  const driving = p.inCar !== null;
  const speedRatio = driving ? Math.min(1, Math.abs(p.inCar.speed) / 720) : 0;
  const policeNear = game.police.length > 0;
  updateAudio(audio, dt, driving, speedRatio, policeNear);
  for (const event of game.events) {
    if (event.type === 'shot') sfxShot(audio);
    else if (event.type === 'crash') sfxCrash(audio);
    else if (event.type === 'pickup') sfxPickup(audio);
    else if (event.type === 'mission-done' || event.type === 'story-done') sfxMission(audio);
    else if (event.type === 'busted' || event.type === 'wasted') sfxBusted(audio);
    else if (event.type === 'ped-run-over' || event.type === 'blood') burst(game, event.x, event.y, PALETTE.blood, 8, 100);
    else if (event.type === 'spark') burst(game, event.x, event.y, '#ffd76a', 6, 90);
  }
}

/** Drain the events stepGame produced since the last drain. */
export function takeEvents(game) {
  const events = game.events;
  game.events = [];
  return events;
}
