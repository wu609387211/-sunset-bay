// The story of Sunset Bay: five missions for Dana Voss, the driver Marisol Vega keeps
// calling. Each mission is a small chain of stages — go somewhere, get in a car, deliver
// something, survive the heat — with a briefing, an objective line for the HUD and a
// cash reward. Finishing all five ends the story. No drawing here: this file only tracks
// what the current stage asks for and whether it is done.
import { NAMES, WANTED } from './config.js';
import { PLACES } from './city.js';

/** Stage kinds and what they need. */
export const STAGE_GOTO = 'goto';
export const STAGE_ENTER_CAR = 'enter-car';
export const STAGE_DELIVER_CAR = 'deliver-car';
export const STAGE_SURVIVE = 'survive';
export const STAGE_CHECKPOINTS = 'checkpoints';
export const STAGE_GET_PACKAGE = 'get-package';
export const STAGE_DELIVER = 'deliver';

function gotoStage(place, text) {
  return { kind: STAGE_GOTO, x: place.x, y: place.y, radius: 70, text, place: place.name };
}

export const MISSIONS = [
  {
    id: 'first-fare',
    name: 'First Fare',
    reward: 300,
    brief:
      'Marisol needs a package run across town. Get to the Harborlight Garage, take the car waiting there, and deliver it to the Bluefin Hotel. Easy money — if you can drive.',
    stages: [
      gotoStage(PLACES.garage, 'Get to the Harborlight Garage'),
      { kind: STAGE_ENTER_CAR, text: 'Get in the car' },
      gotoStage(PLACES.hotel, 'Deliver the car to the Bluefin Hotel'),
    ],
  },
  {
    id: 'borrowed-wheels',
    name: 'Borrowed Wheels',
    reward: 500,
    brief:
      'A client wants a Cobalt GT, the fast one parked down at Marina Point. Marisol does not ask where it came from. Bring it back to the garage — and try not to let the owner catch you.',
    stages: [
      gotoStage(PLACES.marina, 'Find the Cobalt GT at Marina Point'),
      { kind: STAGE_ENTER_CAR, carKind: 'sports', text: 'Take the Cobalt GT' },
      gotoStage(PLACES.garage, 'Bring the Cobalt GT to the garage'),
    ],
  },
  {
    id: 'heat-wave',
    name: 'Heat Wave',
    reward: 600,
    brief:
      'The Cobalt Kings tipped off the police, and now every cruiser in Sunset Bay is looking for you. Stay out of their hands until the heat dies down. Three stars, one driver, sixty seconds.',
    stages: [
      { kind: STAGE_SURVIVE, seconds: 60, wanted: 3, text: 'Lose the police — survive the heat' },
    ],
  },
  {
    id: 'dockside-drop',
    name: 'Dockside Drop',
    reward: 800,
    brief:
      'A crate came in at Coral Docks and it needs to be at the Palms Motel before midnight. The police are already watching the docks, so expect company on the way.',
    stages: [
      gotoStage(PLACES.docks, 'Pick up the crate at Coral Docks'),
      { kind: STAGE_GET_PACKAGE, x: PLACES.docks.x, y: PLACES.docks.y, text: 'Grab the crate' },
      gotoStage(PLACES.motel, 'Deliver the crate to the Palms Motel'),
    ],
  },
  {
    id: 'sunset-run',
    name: 'Sunset Run',
    reward: 1500,
    brief:
      'One last job, the big one. Three drops, one sunset, no stopping. Hit the Bluefin Hotel, the Golden Gull Casino and the Coral Docks before the timer runs out — and the whole city will know your name.',
    stages: [
      {
        kind: STAGE_CHECKPOINTS,
        seconds: 170,
        points: [
          { x: PLACES.hotel.x, y: PLACES.hotel.y, name: PLACES.hotel.name },
          { x: PLACES.casino.x, y: PLACES.casino.y, name: PLACES.casino.name },
          { x: PLACES.docks.x, y: PLACES.docks.y, name: PLACES.docks.name },
        ],
        text: 'Hit all three drops before sunset',
      },
    ],
  },
];

/** Fresh mission progress: which mission, which stage, and the stage's own timers. */
export function createMissionState() {
  return {
    index: 0,
    stage: 0,
    /** Seconds left on a timed stage (survive / checkpoints), or null. */
    timer: null,
    /** Checkpoints already hit on a checkpoints stage. */
    hits: 0,
    /** True once every mission is done. */
    storyDone: false,
    /** The last objective line, for the HUD. */
    objective: '',
    /** A short banner to flash when a stage or mission changes. */
    banner: '',
    bannerTime: 0,
  };
}

/** The mission the player is on, or null when the story is done. */
export function currentMission(missions) {
  if (missions.index >= MISSIONS.length) return null;
  return MISSIONS[missions.index];
}

/** The stage the player is on inside the current mission, or null. */
export function currentStage(missions) {
  const mission = currentMission(missions);
  if (!mission) return null;
  return mission.stages[missions.stage] ?? null;
}

/** Begin the current mission: reset its stage timers and set the opening banner. */
export function startMission(missions, wanted) {
  const mission = currentMission(missions);
  if (!mission) return;
  missions.stage = 0;
  missions.hits = 0;
  missions.timer = null;
  const stage = mission.stages[0];
  if (stage.kind === STAGE_SURVIVE) {
    missions.timer = stage.seconds;
    if (wanted) wanted.stars = Math.max(wanted.stars, stage.wanted);
  } else if (stage.kind === STAGE_CHECKPOINTS) {
    missions.timer = stage.seconds;
  }
  missions.banner = `Mission: ${mission.name}`;
  missions.bannerTime = 3.5;
  missions.objective = stage.text;
}

/**
 * Advance the mission state one step. `world` carries the player, the wanted level and
 * the events the step produced. Returns 'mission-done' | 'story-done' | 'failed' | null.
 */
export function stepMissions(missions, world, dt) {
  const mission = currentMission(missions);
  if (!mission) return null;
  const stage = mission.stages[missions.stage];
  if (!stage) return null;
  const player = world.player;

  if (missions.bannerTime > 0) missions.bannerTime -= dt;

  // Timed stages tick down; a checkpoints stage fails when the timer runs out.
  if (missions.timer !== null) {
    missions.timer -= dt;
    if (missions.timer <= 0) {
      if (stage.kind === STAGE_CHECKPOINTS) {
        missions.banner = 'Too slow — the drops are gone';
        missions.bannerTime = 3;
        return 'failed';
      }
      // A survive stage ending on time is a pass: move on.
      return advanceMission(missions, world);
    }
  }

  const px = player.inCar ? player.inCar.x : player.x;
  const py = player.inCar ? player.inCar.y : player.y;

  switch (stage.kind) {
    case STAGE_GOTO: {
      const dx = stage.x - px;
      const dy = stage.y - py;
      if (Math.hypot(dx, dy) < stage.radius) return advanceMission(missions, world);
      break;
    }
    case STAGE_ENTER_CAR: {
      if (player.inCar) {
        if (!stage.carKind || player.inCar.kind === stage.carKind) return advanceMission(missions, world);
        missions.banner = 'Wrong car — find the right one';
        missions.bannerTime = 2;
      }
      break;
    }
    case STAGE_GET_PACKAGE: {
      // The package is picked up by standing on the marker for a moment.
      const dx = stage.x - px;
      const dy = stage.y - py;
      if (stage.x === undefined) break;
      if (Math.hypot(dx, dy) < 70) return advanceMission(missions, world);
      break;
    }
    case STAGE_DELIVER_CAR:
    case STAGE_DELIVER: {
      const dx = stage.x - px;
      const dy = stage.y - py;
      if (Math.hypot(dx, dy) < stage.radius) return advanceMission(missions, world);
      break;
    }
    case STAGE_CHECKPOINTS: {
      const point = stage.points[missions.hits];
      if (!point) return advanceMission(missions, world);
      const dx = point.x - px;
      const dy = point.y - py;
      if (Math.hypot(dx, dy) < 80) {
        missions.hits += 1;
        missions.banner = `Drop ${missions.hits} of ${stage.points.length} done`;
        missions.bannerTime = 2;
        if (missions.hits >= stage.points.length) return advanceMission(missions, world);
      }
      break;
    }
    default:
      break;
  }
  return null;
}

/** Move to the next stage, or the next mission, paying out when a mission ends. */
function advanceMission(missions, world) {
  const mission = currentMission(missions);
  missions.stage += 1;
  if (missions.stage >= mission.stages.length) {
    world.player.money += mission.reward;
    world.events.push({ type: 'mission-done', mission, reward: mission.reward });
    missions.index += 1;
    missions.stage = 0;
    missions.hits = 0;
    missions.timer = null;
    if (missions.index >= MISSIONS.length) {
      missions.storyDone = true;
      missions.objective = 'Story complete — Sunset Bay is yours';
      missions.banner = 'Story complete!';
      missions.bannerTime = 5;
      return 'story-done';
    }
    const next = MISSIONS[missions.index];
    missions.banner = `Mission complete! +$${mission.reward} — Next: ${next.name}`;
    missions.bannerTime = 4;
    startMissionTimers(missions, world.wanted);
    missions.objective = currentStage(missions).text;
    return 'mission-done';
  }
  const stage = mission.stages[missions.stage];
  missions.objective = stage.text;
  missions.banner = stage.text;
  missions.bannerTime = 2.5;
  startMissionTimers(missions, world.wanted);
  return null;
}

function startMissionTimers(missions, wanted) {
  const stage = currentStage(missions);
  missions.timer = null;
  if (!stage) return;
  if (stage.kind === STAGE_SURVIVE) {
    missions.timer = stage.seconds;
    if (wanted) wanted.stars = Math.max(wanted.stars, stage.wanted);
  } else if (stage.kind === STAGE_CHECKPOINTS) {
    missions.timer = stage.seconds;
  }
}

/** Restart the current mission after a failure (back to its first stage). */
export function retryMission(missions, wanted) {
  missions.stage = 0;
  missions.hits = 0;
  missions.timer = null;
  const stage = currentStage(missions);
  missions.objective = stage ? stage.text : '';
  missions.banner = 'Mission restarted';
  missions.bannerTime = 2;
  startMissionTimers(missions, wanted);
}

/** Where the HUD marker should point: the current stage's target, or null. */
export function missionTarget(missions) {
  const stage = currentStage(missions);
  if (!stage) return null;
  if (stage.kind === STAGE_GOTO || stage.kind === STAGE_DELIVER || stage.kind === STAGE_DELIVER_CAR) {
    return { x: stage.x, y: stage.y, name: stage.place ?? '' };
  }
  if (stage.kind === STAGE_GET_PACKAGE) return { x: stage.x, y: stage.y, name: 'Package' };
  if (stage.kind === STAGE_CHECKPOINTS) {
    const point = stage.points[missions.hits];
    return point ? { x: point.x, y: point.y, name: point.name } : null;
  }
  return null;
}
