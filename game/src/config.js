// Every tuning number and colour for Sunset Bay, in one place. The world is a fixed
// 3840x2880 city; the camera shows a 1280x720 window of it and follows the player, so no
// rule below depends on the screen size. All art is drawn in code: a sun-soaked coastal
// city at golden hour, original to this game.

export const WORLD = { width: 3840, height: 2880 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** City grid: roads run on this pitch, each ROAD_WIDE wide, with sidewalks at their edges. */
export const GRID = { pitch: 320, road: 96, sidewalk: 26 };
export const ROAD_HALF = GRID.road / 2;

/** One block of the city (between roads) is this wide; buildings sit inside it. */
export const BLOCK = GRID.pitch - GRID.road;

export const PLAYER = {
  radius: 14,
  walkSpeed: 230,
  sprintSpeed: 330,
  health: 100,
  /** Seconds after a hit before health starts coming back. */
  regenDelay: 6,
  regenRate: 6,
};

export const CAR = {
  length: 48,
  width: 24,
  /** Engine force, braking force and top speed for a normal street car. */
  accel: 460,
  brake: 700,
  reverseAccel: 300,
  maxSpeed: 560,
  maxReverse: 220,
  /** How sharply a car can turn; scaled down as speed rises. */
  steerRate: 2.6,
  grip: 3.2,
};

export const SPORTS_CAR = {
  accel: 620,
  maxSpeed: 720,
  steerRate: 3.0,
};

export const POLICE_CAR = {
  accel: 560,
  maxSpeed: 660,
  steerRate: 2.9,
};

export const TRAFFIC = {
  /** How many civilian cars and pedestrians are out in the city at once. */
  cars: 14,
  pedestrians: 26,
  /** Civilian cars cruise at this speed on the roads. */
  cruiseSpeed: 170,
  cruiseJitter: 50,
};

export const WANTED = {
  max: 5,
  /** Stars from each crime. */
  stealCar: 1,
  hitPedestrian: 1,
  shoot: 1,
  killPedestrian: 2,
  /** Seconds with no crime and no police in sight before one star fades. */
  decaySeconds: 25,
  /** Police cars on the street per wanted star. */
  carsPerStar: 1,
  /** How close a police car must be to keep the heat on. */
  sightRange: 520,
};

export const POLICE = {
  /** Seconds a police car must sit on a slow player before the bust lands. */
  bustSeconds: 3,
  /** Player speed below which a police car next to them counts as pinning them down. */
  pinSpeed: 60,
  pinRange: 70,
  /** Seconds a police car waits, stuck, before it gives up and respawns elsewhere. */
  stuckSeconds: 6,
};

export const COMBAT = {
  pistolDamage: 34,
  pistolRange: 520,
  pistolRate: 0.22,
  magSize: 12,
  reloadSeconds: 1.1,
  bulletSpeed: 900,
  /** Cash a pedestrian drops when scared off, and what a mission pays on top. */
  pedDropChance: 0.25,
  pedDropCash: 25,
};

export const PICKUP = {
  health: 30,
  ammo: 24,
  cash: 50,
};

export const MONEY = {
  /** What the player loses when busted. */
  bustFine: 150,
};

/** Golden-hour palette: warm dusk light over a coastal city. */
export const PALETTE = {
  backdrop: '#1a1210',
  grass: '#7d9b4a',
  parkGrass: '#6f9a4e',
  sand: '#d9b380',
  water: '#2e6f8e',
  waterDeep: '#245a75',
  road: '#3a3a42',
  roadLine: '#d8c25a',
  sidewalk: '#8a8578',
  curb: '#6d675c',
  buildingRoof: '#b98a5e',
  buildingWall: '#8a6a4f',
  buildingGlass: '#ffd98a',
  buildingEdge: '#5d4632',
  player: '#ffcf3f',
  playerShirt: '#e5484d',
  pedShirt: ['#4fc3f7', '#f2c94c', '#9b7ede', '#7ee081', '#f28bb1', '#ff9a5c'],
  carBody: ['#c0392b', '#2471a3', '#7d3c98', '#b7950b', '#1e8449', '#ca6f1e', '#5d6d7e', '#922b21', '#2e86c1', '#d4ac0d'],
  policeBody: '#1c2733',
  policeLightRed: '#ff3b30',
  policeLightBlue: '#2f7bff',
  taxiBody: '#f7c948',
  marker: '#ffe14d',
  markerRing: '#ffffff',
  text: '#f5efe4',
  muted: '#b8ab98',
  panel: 'rgba(24, 18, 14, 0.92)',
  panelEdge: '#d8a24a',
  hudBg: 'rgba(20, 14, 10, 0.72)',
  health: '#58d68d',
  healthLow: '#e74c3c',
  star: '#ffd700',
  starEmpty: '#5c5348',
  minimapBg: 'rgba(16, 12, 10, 0.85)',
  minimapRoad: '#8a8578',
  minimapBlock: '#4a3f35',
  minimapPlayer: '#ffe14d',
  minimapPolice: '#4da3ff',
  minimapMarker: '#ff5c5c',
  muzzle: '#ffd76a',
  blood: '#c0392b',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save lives between visits (this browser only). */
export const SAVE_KEY = 'sunset-bay.save.v1';
/** Where the best (most money held at story end) is kept. */
export const BEST_KEY = 'sunset-bay.best';

/** The game's own names: city, people, places, gangs. Nothing from any commercial game. */
export const NAMES = {
  city: 'Sunset Bay',
  game: 'Sunset Bay',
  player: 'Dana Voss',
  fixer: 'Marisol Vega',
  garage: 'Harborlight Garage',
  hotel: 'Bluefin Hotel',
  motel: 'Palms Motel',
  docks: 'Coral Docks',
  marina: 'Marina Point',
  hospital: 'St. Anselm Hospital',
  casino: 'Golden Gull Casino',
  gang: 'Cobalt Kings',
  sportsCar: 'Cobalt GT',
};

/** Mission briefings, shown on the start screen and when a mission begins. */
export const STORY_INTRO =
  'Dana Voss came to Sunset Bay to drive — fast, quiet, no questions. Marisol Vega runs the Harborlight Garage and always has work for a driver who can keep a cool head when the sirens start.';
