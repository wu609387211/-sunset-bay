// The save: one JSON blob in localStorage — money, mission progress and where Dana
// is standing. The game saves itself when a mission ends and from the pause menu;
// the title screen offers to continue when a save exists.
import { SAVE_KEY, BEST_KEY } from './config.js';

function read(key) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage can be off (private windows): the game then lasts this visit only.
  }
}

/** The whole saveable state, as plain data. */
export function saveGame(game) {
  const p = game.player;
  write(SAVE_KEY, {
    version: 1,
    money: Math.round(p.money),
    health: Math.round(p.health),
    ammo: p.ammo,
    missionIndex: game.missions.index,
    stage: game.missions.stage,
    x: Math.round(p.inCar ? p.inCar.x : p.x),
    y: Math.round(p.inCar ? p.inCar.y : p.y),
    time: Math.round(game.time),
  });
}

/** The save, or null when there is none (or it is unreadable). */
export function loadGame() {
  const data = read(SAVE_KEY);
  if (!data || data.version !== 1) return null;
  return data;
}

export function hasSave() {
  return loadGame() !== null;
}

/** The best haul (most money held when the story ended), or 0. */
export function readBest() {
  const value = read(BEST_KEY);
  return typeof value === 'number' ? value : 0;
}

export function saveBest(money) {
  const best = readBest();
  if (money > best) write(BEST_KEY, Math.round(money));
}
