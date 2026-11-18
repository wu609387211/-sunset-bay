// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps, and the renderer paints what is there. The game moves between screens: title,
// play, paused, busted, wasted and story-complete. On the title screen the city keeps
// moving behind the panel (traffic only — the story does not start until you do).
//
// ?seed=N fixes the city. ?shot=cover|foot|chase|start (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady.
import { STEP } from './config.js';
import { createGame, resetGame, applySave, stepGame, takeEvents } from './game.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_RELOAD, createInput } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_STORY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { stageShot } from './shots.js';
import { hasSave, loadGame, readBest, saveGame } from './save.js';
import { ensureAudio } from './audio.js';
import { startMission } from './missions.js';
import { stepPedestrians, stepTraffic } from './entities.js';

const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const game = createGame(seed);
const renderer = createRenderer(canvas);
// A handle for play-testing from the outside (console, automation): the live game.
window.__sunset = game;

function announce(message) {
  status.textContent = message;
}

function runShot(name) {
  const scene = stageShot(name, game);
  let painted = 0;
  function paint() {
    renderer.draw(game, scene.screen, scene.ui);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let saveExists = hasSave();
  let muted = false;
  let fine = 0;
  let accumulator = 0;
  let last = performance.now();
  /** One-shot presses collected once per frame, shared by the screens and the steps. */
  let frameActions = 0;

  window.addEventListener('pointerdown', () => ensureAudio(game.audio), { once: false });
  window.addEventListener('keydown', () => ensureAudio(game.audio), { once: false });
  window.addEventListener('keydown', (event) => {
    if (screen === SCREEN_TITLE && event.code === 'KeyN') startGame(false);
    else if (screen === SCREEN_PAUSED && event.code === 'KeyS') {
      saveGame(game);
      announce('Saved.');
    } else if (screen === SCREEN_PAUSED && event.code === 'KeyQ') {
      screen = SCREEN_TITLE;
      saveExists = hasSave();
      announce('Sunset Bay. Press Enter to start.');
    }
  });

  function startGame(continueSave) {
    resetGame(game);
    if (continueSave) {
      const save = loadGame();
      if (save) applySave(game, save);
    }
    startMission(game.missions, game.wanted);
    fine = 0;
    screen = SCREEN_PLAY;
    announce(`Playing. Mission ${game.missions.index + 1}: ${game.missions.objective}`);
  }

  function handleActions(actions) {
    if (actions & ACTION_MUTE) muted = !muted;
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONFIRM) startGame(saveExists);
      return;
    }
    if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
      return;
    }
    if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
      return;
    }
    // Busted, wasted and story-complete: one press gets back in.
    if (actions & ACTION_CONFIRM) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function buildControl() {
    const move = input.moveVector();
    const mouse = input.mouse();
    game.mouse = mouse;
    const aim = mouse.seen ? renderer.screenToWorld(game, mouse.x, mouse.y) : { x: game.player.x, y: game.player.y - 100 };
    game.aimWorld = aim;
    const inCar = game.player.inCar !== null;
    const actions = frameActions;
    // Enter and reload are one-shot: the first step of the frame takes them.
    frameActions &= ~(ACTION_ENTER | ACTION_RELOAD);
    return {
      moveX: move.x,
      moveY: move.y,
      sprint: input.sprinting(),
      throttle: inCar ? (move.y < 0 ? 1 : move.y > 0 ? -1 : 0) : 0,
      steer: inCar ? move.x : 0,
      handbrake: inCar && input.handbrake(),
      enter: Boolean(actions & ACTION_ENTER),
      reload: Boolean(actions & ACTION_RELOAD),
      shooting: !inCar && input.isShooting(),
      aimX: aim.x,
      aimY: aim.y,
      muted,
    };
  }

  function handleEvents() {
    for (const event of takeEvents(game)) {
      if (event.type === 'busted') {
        fine = event.fine;
        screen = SCREEN_BUSTED;
        announce(`Caught. The police took $${fine}.`);
      } else if (event.type === 'wasted') {
        screen = SCREEN_WASTED;
        announce('Down and out. You wake up at the hospital.');
      } else if (event.type === 'story-done') {
        best = Math.max(best, Math.round(game.player.money));
        screen = SCREEN_STORY;
        announce('Story complete. Sunset Bay is yours.');
      }
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      // Attract mode: traffic rolls, pedestrians stroll, the story waits.
      game.time += STEP;
      stepTraffic(game.entities, STEP, game.random, game.city);
      stepPedestrians(game.entities, STEP, game.random, { x: 0, y: 0, active: false }, game.city);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    const ctl = buildControl();
    stepGame(game, STEP, ctl);
    handleEvents();
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    frameActions |= input.takeActions();
    handleActions(frameActions);
    while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
      step();
      accumulator -= STEP;
    }
    if (screen !== SCREEN_TITLE && screen !== SCREEN_PLAY) accumulator = 0;
    frameActions = 0;
    renderer.draw(game, screen, { best, hasSave: saveExists, fine });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce('Sunset Bay. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
