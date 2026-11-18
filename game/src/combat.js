// Combat and pickups: the pistol, bullets, and the health, ammo and cash lying around
// Sunset Bay. A bullet is a fast point that stops at the first thing it meets — a
// building, a car, a pedestrian, a police car. Shooting people is a crime: the wanted
// system hears about it through the events this file pushes.
import { COMBAT, PICKUP, WANTED } from './config.js';
import { CAR_POLICE } from './entities.js';
import { hitsBuilding, randomRoadPoint } from './city.js';

export function createCombat(random) {
  const combat = {
    bullets: [],
    pickups: [],
    /** Seconds until the pistol can fire again. */
    cooldown: 0,
    /** Seconds left on the reload. */
    reloading: 0,
    /** Where the last muzzle flash was, for the renderer. */
    muzzle: null,
    muzzleTime: 0,
    pickupTimer: 8,
    random,
  };
  spawnStartingPickups(combat, random);
  return combat;
}

function spawnStartingPickups(combat, random) {
  // Health by the hospital, ammo by the garage, cash scattered on the roads.
  combat.pickups.push({ kind: 'health', x: 6 * 320 + 90, y: 2 * 320 + 90, amount: PICKUP.health, bob: random() * 6 });
  combat.pickups.push({ kind: 'ammo', x: 2 * 320 + 90, y: 2 * 320 - 40, amount: PICKUP.ammo, bob: random() * 6 });
  for (let i = 0; i < 6; i += 1) {
    const spot = randomRoadPoint(random);
    combat.pickups.push({ kind: 'cash', x: spot.x, y: spot.y, amount: PICKUP.cash, bob: random() * 6 });
  }
}

/** Try to fire the pistol from (x, y) along `angle`. Returns true when a shot left. */
export function firePistol(combat, player, angle, worldTime) {
  if (combat.cooldown > 0 || combat.reloading > 0) return false;
  if (player.ammo <= 0) return false;
  player.ammo -= 1;
  combat.cooldown = COMBAT.pistolRate;
  combat.bullets.push({
    x: player.x + Math.cos(angle) * 24,
    y: player.y + Math.sin(angle) * 24,
    vx: Math.cos(angle) * COMBAT.bulletSpeed,
    vy: Math.sin(angle) * COMBAT.bulletSpeed,
    travelled: 0,
  });
  combat.muzzle = { x: player.x + Math.cos(angle) * 26, y: player.y + Math.sin(angle) * 26 };
  combat.muzzleTime = 0.06;
  return true;
}

/** Start a reload; the ammo comes back when the timer runs out. */
export function startReload(combat, player) {
  if (combat.reloading > 0 || player.ammo >= COMBAT.magSize) return false;
  combat.reloading = COMBAT.reloadSeconds;
  return true;
}

function damagePedestrian(combat, ped, world) {
  ped.hp = (ped.hp ?? 100) - COMBAT.pistolDamage;
  if (ped.hp > 0) {
    ped.state = 'flee';
    ped.stateTime = 0;
    ped.fleeX = ped.x + (ped.x - world.player.x) * 2;
    ped.fleeY = ped.y + (ped.y - world.player.y) * 2;
    return;
  }
  ped.state = 'down';
  ped.stateTime = 0;
  ped.dead = false;
  world.events.push({ type: 'ped-shot' });
  if (combat.random() < COMBAT.pedDropChance) {
    combat.pickups.push({ kind: 'cash', x: ped.x, y: ped.y, amount: COMBAT.pedDropCash, bob: 0 });
  }
}

/**
 * One step: move bullets and resolve hits, tick the pistol timers, let pickups bob,
 * and hand out whatever the player walks or drives over.
 */
export function stepCombat(combat, world, dt) {
  const player = world.player;
  if (combat.cooldown > 0) combat.cooldown -= dt;
  if (combat.muzzleTime > 0) combat.muzzleTime -= dt;
  if (combat.reloading > 0) {
    combat.reloading -= dt;
    if (combat.reloading <= 0) player.ammo = COMBAT.magSize;
  }

  for (let i = combat.bullets.length - 1; i >= 0; i -= 1) {
    const b = combat.bullets[i];
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.travelled += COMBAT.bulletSpeed * dt;
    let dead = b.travelled > COMBAT.pistolRange;
    if (!dead && hitsBuilding(world.city.buildings, b.x, b.y, 2)) {
      world.events.push({ type: 'spark', x: b.x, y: b.y });
      dead = true;
    }
    if (!dead) {
      for (const car of world.cars) {
        if (car.dead) continue;
        const dx = car.x - b.x;
        const dy = car.y - b.y;
        if (dx * dx + dy * dy < car.radius * car.radius) {
          if (car.kind === CAR_POLICE && world.time - car.lastShot > 2) {
            car.lastShot = world.time;
            world.events.push({ type: 'cop-shot' });
          } else {
            world.events.push({ type: 'spark', x: b.x, y: b.y });
          }
          dead = true;
          break;
        }
      }
    }
    if (!dead) {
      for (const ped of world.peds) {
        if (ped.dead || ped.state === 'down' || ped.state === 'drive') continue;
        const dx = ped.x - b.x;
        const dy = ped.y - b.y;
        if (dx * dx + dy * dy < (ped.radius + 4) * (ped.radius + 4)) {
          damagePedestrian(combat, ped, world);
          world.events.push({ type: 'blood', x: ped.x, y: ped.y });
          dead = true;
          break;
        }
      }
    }
    if (dead) combat.bullets.splice(i, 1);
  }

  // Pickups: bob, respawn slowly, and collect on touch.
  combat.pickupTimer -= dt;
  if (combat.pickupTimer <= 0) {
    combat.pickupTimer = 14;
    const spot = randomRoadPoint(combat.random);
    const kinds = ['cash', 'cash', 'ammo', 'health'];
    combat.pickups.push({ kind: kinds[Math.floor(combat.random() * kinds.length)], x: spot.x, y: spot.y, amount: 0, bob: 0 });
  }
  const px = player.inCar ? player.inCar.x : player.x;
  const py = player.inCar ? player.inCar.y : player.y;
  for (let i = combat.pickups.length - 1; i >= 0; i -= 1) {
    const pk = combat.pickups[i];
    pk.bob += dt;
    const dx = pk.x - px;
    const dy = pk.y - py;
    if (dx * dx + dy * dy < 44 * 44) {
      if (pk.kind === 'health') {
        if (player.health >= 100) continue;
        player.health = Math.min(100, player.health + (pk.amount || PICKUP.health));
      } else if (pk.kind === 'ammo') {
        player.ammo += pk.amount || PICKUP.ammo;
      } else {
        player.money += pk.amount || PICKUP.cash;
      }
      world.events.push({ type: 'pickup', kind: pk.kind, x: pk.x, y: pk.y });
      combat.pickups.splice(i, 1);
    }
  }
}
