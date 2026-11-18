// Drawing only: the game state and the current screen in, pixels out. The camera
// follows the player through the city at golden hour; the HUD, minimap and menus are
// drawn in screen space on top. Flat shapes and canvas text, no images, no network.
import { BLOCK, FONT, GRID, NAMES, PALETTE, ROAD_HALF, WORLD } from './config.js';
import { BEACH_Y, DOCKS_X, PARK_BLOCK, PLACES, ROAD_X, ROAD_Y } from './city.js';
import { CAR_POLICE } from './entities.js';
import { MISSIONS, missionTarget } from './missions.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';
export const SCREEN_STORY = 'story';

const VIEW = { width: 1280, height: 720 };
const MINIMAP = { width: 208, height: 156, margin: 16 };

function cachedLabel(prefix) {
  let value = null;
  let text = '';
  return function label(next) {
    if (next !== value) {
      value = next;
      text = prefix + next;
    }
    return text;
  };
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0, ratio: 1 };
  const moneyLabel = cachedLabel('$');
  const ammoLabel = cachedLabel('Ammo ');
  const speedLabel = cachedLabel('');
  const timerLabel = cachedLabel('');

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.ratio = ratio;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  const fonts = new Map();
  function text(value, x, y, size, color, align = 'left', baseline = 'top') {
    if (!fonts.has(size)) fonts.set(size, `${size}px ${FONT}`);
    context.font = fonts.get(size);
    context.fillStyle = color;
    context.textAlign = align;
    context.textBaseline = baseline;
    context.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  /** The camera: centred on the player, clamped so it never leaves the city. */
  function cameraFor(game) {
    const p = game.player.inCar ?? game.player;
    const vw = canvas.width / view.scale;
    const vh = canvas.height / view.scale;
    const shake = game.shake || 0;
    const sx = (Math.random() - 0.5) * shake;
    const sy = (Math.random() - 0.5) * shake;
    return {
      x: Math.max(vw / 2, Math.min(WORLD.width - vw / 2, p.x)) - vw / 2 + sx,
      y: Math.max(vh / 2, Math.min(WORLD.height - vh / 2, p.y)) - vh / 2 + sy,
      w: vw,
      h: vh,
    };
  }

  function drawGround(game, cam) {
    const { x: cx, y: cy, w, h } = cam;
    // Base: dry grass between the blocks.
    context.fillStyle = PALETTE.grass;
    context.fillRect(cx, cy, w, h);
    // The park block.
    const parkX = ROAD_X[PARK_BLOCK.bx] + ROAD_HALF;
    const parkY = ROAD_Y[PARK_BLOCK.by] + ROAD_HALF;
    context.fillStyle = PALETTE.parkGrass;
    context.fillRect(parkX, parkY, GRID.pitch - GRID.road, GRID.pitch - GRID.road);
    // The beach and the water along the south shore.
    context.fillStyle = PALETTE.sand;
    context.fillRect(cx, Math.max(cy, BEACH_Y), w, Math.max(0, cy + h - BEACH_Y));
    context.fillStyle = PALETTE.water;
    context.fillRect(cx, Math.max(cy, BEACH_Y + 96), w, Math.max(0, cy + h - BEACH_Y - 96));
    context.fillStyle = PALETTE.waterDeep;
    for (let wx = Math.floor(cx / 220) * 220; wx < cx + w; wx += 220) {
      context.fillRect(wx, Math.max(cy, BEACH_Y + 130), 120, 4);
    }
    // The docks: wooden piers on the east edge.
    context.fillStyle = '#6d5138';
    for (let dy = ROAD_Y[2]; dy < ROAD_Y[8]; dy += GRID.pitch) {
      context.fillRect(DOCKS_X - 10, dy - 14, 150, 28);
    }
    // Sidewalks, then roads, then the centre dashes.
    context.fillStyle = PALETTE.sidewalk;
    for (const rx of ROAD_X) context.fillRect(rx - ROAD_HALF - GRID.sidewalk, cy, GRID.road + GRID.sidewalk * 2, h);
    for (const ry of ROAD_Y) context.fillRect(cx, ry - ROAD_HALF - GRID.sidewalk, w, GRID.road + GRID.sidewalk * 2);
    context.fillStyle = PALETTE.road;
    for (const rx of ROAD_X) context.fillRect(rx - ROAD_HALF, cy, GRID.road, h);
    for (const ry of ROAD_Y) context.fillRect(cx, ry - ROAD_HALF, w, GRID.road);
    context.fillStyle = PALETTE.roadLine;
    for (const rx of ROAD_X) {
      for (let y = Math.floor(cy / 64) * 64; y < cy + h; y += 64) context.fillRect(rx - 2, y, 4, 30);
    }
    for (const ry of ROAD_Y) {
      for (let x = Math.floor(cx / 64) * 64; x < cx + w; x += 64) context.fillRect(x, ry - 2, 30, 4);
    }
    // Buildings: a long shadow to the east (low sun), then the roof and lit windows.
    for (const b of game.city.buildings) {
      if (b.x > cx + w || b.x + b.width < cx || b.y > cy + h || b.y + b.height < cy) continue;
      context.fillStyle = 'rgba(0,0,0,0.28)';
      context.fillRect(b.x + b.shade, b.y + b.shade, b.width, b.height);
      context.fillStyle = b.roof;
      context.fillRect(b.x, b.y, b.width, b.height);
      context.strokeStyle = PALETTE.buildingEdge;
      context.lineWidth = 2;
      context.strokeRect(b.x, b.y, b.width, b.height);
      if (b.glass) {
        context.fillStyle = PALETTE.buildingGlass;
        const cols = Math.max(1, Math.floor(b.width / 46));
        const rows = Math.max(1, Math.floor(b.height / 46));
        for (let i = 0; i < cols; i += 1) {
          for (let j = 0; j < rows; j += 1) {
            if ((i * 7 + j * 13 + b.hue) % 3 === 0) continue;
            context.fillRect(b.x + 10 + i * ((b.width - 20) / cols), b.y + 10 + j * ((b.height - 20) / rows), 14, 10);
          }
        }
      }
    }
    // Trees: round canopies in the park, palms on the beach.
    for (const t of game.city.trees) {
      if (t.x < cx - 30 || t.x > cx + w + 30 || t.y < cy - 30 || t.y > cy + h + 30) continue;
      context.fillStyle = 'rgba(0,0,0,0.22)';
      context.beginPath();
      context.ellipse(t.x + 4, t.y + 5, t.r, t.r * 0.6, 0, 0, Math.PI * 2);
      context.fill();
      if (t.palm) {
        context.strokeStyle = '#7a5a34';
        context.lineWidth = 4;
        context.beginPath();
        context.moveTo(t.x, t.y + t.r * 0.5);
        context.lineTo(t.x + 3, t.y - t.r * 0.5);
        context.stroke();
        context.fillStyle = '#3f8f4f';
      } else {
        context.fillStyle = '#4e8a3f';
      }
      context.beginPath();
      context.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(255,255,255,0.14)';
      context.beginPath();
      context.arc(t.x - t.r * 0.3, t.y - t.r * 0.3, t.r * 0.5, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawMarker(game) {
    const target = missionTarget(game.missions);
    if (!target) return;
    const pulse = 1 + Math.sin(game.time * 4) * 0.15;
    const r = 16 * pulse;
    context.save();
    context.translate(target.x, target.y);
    context.rotate(Math.PI / 4);
    context.fillStyle = PALETTE.marker;
    context.fillRect(-r / 2, -r / 2, r, r);
    context.strokeStyle = PALETTE.markerRing;
    context.lineWidth = 3;
    context.strokeRect(-r / 2, -r / 2, r, r);
    context.restore();
    // A light pillar so the marker reads from far away.
    const grad = context.createLinearGradient(target.x, target.y - 260, target.x, target.y);
    grad.addColorStop(0, 'rgba(255,225,77,0)');
    grad.addColorStop(1, 'rgba(255,225,77,0.4)');
    context.fillStyle = grad;
    context.fillRect(target.x - 8, target.y - 260, 16, 260);
  }

  function drawPickups(game) {
    for (const pk of game.combat.pickups) {
      const bob = Math.sin(pk.bob * 3) * 3;
      const y = pk.y + bob;
      if (pk.kind === 'health') {
        context.fillStyle = '#ffffff';
        context.fillRect(pk.x - 12, y - 12, 24, 24);
        context.fillStyle = '#27ae60';
        context.fillRect(pk.x - 3, y - 9, 6, 18);
        context.fillRect(pk.x - 9, y - 3, 18, 6);
      } else if (pk.kind === 'ammo') {
        context.fillStyle = '#5d4037';
        context.fillRect(pk.x - 12, y - 9, 24, 18);
        context.fillStyle = '#ffd76a';
        context.fillRect(pk.x - 8, y - 5, 5, 10);
        context.fillRect(pk.x - 1, y - 5, 5, 10);
        context.fillRect(pk.x + 6, y - 5, 5, 10);
      } else {
        context.fillStyle = '#2ecc71';
        context.beginPath();
        context.arc(pk.x, y, 11, 0, Math.PI * 2);
        context.fill();
        context.fillStyle = '#ffffff';
        context.font = `bold 13px ${FONT}`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText('$', pk.x, y + 1);
      }
    }
  }

  function drawCar(game, car) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    // Headlight cones in the dusk.
    const grad = context.createLinearGradient(20, 0, 130, 0);
    grad.addColorStop(0, 'rgba(255,240,170,0.20)');
    grad.addColorStop(1, 'rgba(255,240,170,0)');
    context.fillStyle = grad;
    context.beginPath();
    context.moveTo(18, -8);
    context.lineTo(130, -34);
    context.lineTo(130, 34);
    context.lineTo(18, 8);
    context.closePath();
    context.fill();
    // Body, roof, windshield, wheels.
    context.fillStyle = '#111111';
    context.fillRect(-24, -14, 48, 28);
    context.fillStyle = car.color;
    roundRect(-24, -11, 48, 22, 7);
    context.fill();
    context.fillStyle = 'rgba(255,255,255,0.22)';
    roundRect(-6, -9, 16, 18, 4);
    context.fill();
    context.fillStyle = '#1a2b3c';
    context.fillRect(8, -9, 9, 18);
    context.fillStyle = '#ffe9a8';
    context.fillRect(22, -10, 3, 5);
    context.fillRect(22, 5, 3, 5);
    if (car.kind === CAR_POLICE) {
      const flash = Math.floor(game.time * 6) % 2 === 0;
      context.fillStyle = flash ? PALETTE.policeLightRed : PALETTE.policeLightBlue;
      context.fillRect(-4, -11, 8, 5);
      context.fillStyle = flash ? PALETTE.policeLightBlue : PALETTE.policeLightRed;
      context.fillRect(-4, 6, 8, 5);
      context.fillStyle = '#ffffff';
      context.font = `bold 9px ${FONT}`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('POLICE', 0, 1);
    } else if (car.kind === 'taxi') {
      context.fillStyle = '#111111';
      context.font = `bold 8px ${FONT}`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText('TAXI', 0, 1);
    }
    context.restore();
  }

  function drawPedestrian(game, ped) {
    if (ped.state === 'drive') return;
    context.save();
    context.translate(ped.x, ped.y);
    if (ped.state === 'down') {
      context.rotate(ped.angle + Math.PI / 2);
      context.fillStyle = ped.color;
      context.beginPath();
      context.ellipse(0, 0, 14, 7, 0, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#e8b98a';
      context.beginPath();
      context.arc(15, 0, 6, 0, Math.PI * 2);
      context.fill();
      context.restore();
      return;
    }
    const wobble = Math.sin(game.time * 9 + ped.x) * 2;
    context.fillStyle = 'rgba(0,0,0,0.25)';
    context.beginPath();
    context.ellipse(0, 8, 9, 4, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = ped.color;
    context.beginPath();
    context.arc(0, 0, 10, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e8b98a';
    context.beginPath();
    context.arc(Math.cos(ped.angle) * 4, Math.sin(ped.angle) * 4 - 4, 6, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#2b2b2b';
    context.beginPath();
    context.arc(Math.cos(ped.angle) * 5 + wobble * 0.4, Math.sin(ped.angle) * 5 - 7, 5, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }

  function drawPlayer(game) {
    const p = game.player;
    if (p.inCar) return;
    context.save();
    context.translate(p.x, p.y);
    if (p.invulnerable > 0 && Math.floor(p.invulnerable * 10) % 2 === 0) {
      context.globalAlpha = 0.35;
    }
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.beginPath();
    context.ellipse(0, 9, 11, 5, 0, 0, Math.PI * 2);
    context.fill();
    context.rotate(p.aimAngle);
    // The pistol, held out toward the mouse.
    context.fillStyle = '#222222';
    context.fillRect(8, -2, 16, 4);
    context.rotate(-p.aimAngle);
    context.fillStyle = PALETTE.playerShirt;
    context.beginPath();
    context.arc(0, 0, 12, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e8b98a';
    context.beginPath();
    context.arc(0, -3, 7, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#3a2a1a';
    context.beginPath();
    context.arc(0, -6, 6, 0, Math.PI * 2);
    context.fill();
    // A gold ring so the player always reads against the street.
    context.strokeStyle = PALETTE.player;
    context.lineWidth = 2.5;
    context.beginPath();
    context.arc(0, 0, 15, 0, Math.PI * 2);
    context.stroke();
    context.restore();
  }

  function drawBullets(game) {
    context.strokeStyle = '#ffe9a8';
    context.lineWidth = 3;
    for (const b of game.combat.bullets) {
      context.beginPath();
      context.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    if (game.combat.muzzleTime > 0 && game.combat.muzzle) {
      context.fillStyle = PALETTE.muzzle;
      context.beginPath();
      context.arc(game.combat.muzzle.x, game.combat.muzzle.y, 10, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawParticles(game) {
    for (const pt of game.particles) {
      context.globalAlpha = Math.max(0, pt.life / pt.maxLife);
      context.fillStyle = pt.color;
      context.fillRect(pt.x - pt.size / 2, pt.y - pt.size / 2, pt.size, pt.size);
    }
    context.globalAlpha = 1;
  }

  /** Warm dusk light over the whole scene, stronger at the edges. */
  function drawDusk(cam) {
    const grad = context.createRadialGradient(
      cam.x + cam.w / 2, cam.y + cam.h / 2, Math.min(cam.w, cam.h) * 0.32,
      cam.x + cam.w / 2, cam.y + cam.h / 2, Math.max(cam.w, cam.h) * 0.72,
    );
    grad.addColorStop(0, 'rgba(255,170,80,0.05)');
    grad.addColorStop(1, 'rgba(120,40,20,0.22)');
    context.fillStyle = grad;
    context.fillRect(cam.x, cam.y, cam.w, cam.h);
  }

  function drawStars(game) {
    const x0 = VIEW.width - MINIMAP.margin - MINIMAP.width;
    const y0 = MINIMAP.margin + MINIMAP.height + 10;
    for (let i = 0; i < 5; i += 1) {
      context.fillStyle = i < game.wanted.stars ? PALETTE.star : PALETTE.starEmpty;
      drawStar(x0 + 14 + i * 30, y0 + 12, 11, game.wanted.stars > 0 && Math.floor(game.time * 3) % 2 === 0 && i === game.wanted.stars - 1 ? 1.25 : 1);
    }
    if (game.wanted.stars > 0) {
      text('WANTED', x0 + MINIMAP.width - 8, y0 + 4, 13, PALETTE.muted, 'right');
    }
  }

  function drawStar(cx, cy, r, scale) {
    context.save();
    context.translate(cx, cy);
    context.scale(scale, scale);
    context.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const ang = -Math.PI / 2 + (i * Math.PI) / 5;
      const rad = i % 2 === 0 ? r : r * 0.45;
      const x = Math.cos(ang) * rad;
      const y = Math.sin(ang) * rad;
      if (i === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.closePath();
    context.fill();
    context.restore();
  }

  function drawMinimap(game) {
    const x0 = VIEW.width - MINIMAP.margin - MINIMAP.width;
    const y0 = MINIMAP.margin;
    const sx = MINIMAP.width / WORLD.width;
    const sy = MINIMAP.height / WORLD.height;
    context.fillStyle = PALETTE.minimapBg;
    roundRect(x0 - 4, y0 - 4, MINIMAP.width + 8, MINIMAP.height + 8, 8);
    context.fill();
    context.save();
    context.beginPath();
    roundRect(x0, y0, MINIMAP.width, MINIMAP.height, 6);
    context.clip();
    context.fillStyle = PALETTE.minimapBlock;
    context.fillRect(x0, y0, MINIMAP.width, MINIMAP.height);
    context.strokeStyle = PALETTE.minimapRoad;
    context.lineWidth = 3;
    for (const rx of ROAD_X) {
      context.beginPath();
      context.moveTo(x0 + rx * sx, y0);
      context.lineTo(x0 + rx * sx, y0 + MINIMAP.height);
      context.stroke();
    }
    for (const ry of ROAD_Y) {
      context.beginPath();
      context.moveTo(x0, y0 + ry * sy);
      context.lineTo(x0 + MINIMAP.width, y0 + ry * sy);
      context.stroke();
    }
    // Water and beach along the south edge.
    context.fillStyle = PALETTE.water;
    context.fillRect(x0, y0 + BEACH_Y * sy, MINIMAP.width, MINIMAP.height - BEACH_Y * sy);
    // Cars, police, the mission marker and the player.
    context.fillStyle = '#ffffff';
    for (const car of game.cars) {
      if (car.dead || car === game.player.inCar) continue;
      context.fillRect(x0 + car.x * sx - 1.5, y0 + car.y * sy - 1.5, 3, 3);
    }
    context.fillStyle = PALETTE.minimapPolice;
    for (const car of game.police) {
      context.beginPath();
      context.arc(x0 + car.x * sx, y0 + car.y * sy, 3.5, 0, Math.PI * 2);
      context.fill();
    }
    const target = missionTarget(game.missions);
    if (target) {
      const pulse = 3 + Math.sin(game.time * 5) * 1.5;
      context.fillStyle = PALETTE.minimapMarker;
      context.beginPath();
      context.arc(x0 + target.x * sx, y0 + target.y * sy, pulse, 0, Math.PI * 2);
      context.fill();
    }
    const p = game.player.inCar ?? game.player;
    context.save();
    context.translate(x0 + p.x * sx, y0 + p.y * sy);
    context.rotate(p.angle);
    context.fillStyle = PALETTE.minimapPlayer;
    context.beginPath();
    context.moveTo(7, 0);
    context.lineTo(-5, -5);
    context.lineTo(-5, 5);
    context.closePath();
    context.fill();
    context.restore();
    // A frame and the city name.
    context.restore();
    context.strokeStyle = PALETTE.panelEdge;
    context.lineWidth = 1.5;
    roundRect(x0 - 4, y0 - 4, MINIMAP.width + 8, MINIMAP.height + 8, 8);
    context.stroke();
    text(NAMES.city.toUpperCase(), x0 + MINIMAP.width, y0 + MINIMAP.height + 44, 12, PALETTE.muted, 'right');
  }

  function drawHud(game) {
    // Top-left: the mission and its objective.
    const mission = MISSIONS[game.missions.index] ?? null;
    context.fillStyle = PALETTE.hudBg;
    roundRect(16, 16, 360, 64, 8);
    context.fill();
    const name = mission ? `MISSION ${game.missions.index + 1}/${MISSIONS.length} — ${mission.name}` : 'FREE ROAM';
    text(name, 28, 26, 15, PALETTE.marker, 'left');
    text(game.missions.objective || 'Explore Sunset Bay', 28, 48, 17, PALETTE.text, 'left');
    const target = missionTarget(game.missions);
    if (target) {
      const p = game.player.inCar ?? game.player;
      const d = Math.round(Math.hypot(target.x - p.x, target.y - p.y));
      text(`${d}m to ${target.name || 'target'}`, 28, 66, 13, PALETTE.muted, 'left');
    }
    if (game.missions.timer !== null && game.missions.timer > 0) {
      text(timerLabel(Math.ceil(game.missions.timer)), 388, 26, 22, '#ff9a5c', 'left');
      text('left', 388, 52, 13, PALETTE.muted, 'left');
    }
    drawMinimap(game);
    drawStars(game);
    // Bottom-left: health and money.
    context.fillStyle = PALETTE.hudBg;
    roundRect(16, VIEW.height - 64, 260, 48, 8);
    context.fill();
    const hp = Math.max(0, game.player.health);
    context.fillStyle = '#3a2a22';
    context.fillRect(28, VIEW.height - 52, 150, 14);
    context.fillStyle = hp > 30 ? PALETTE.health : PALETTE.healthLow;
    context.fillRect(28, VIEW.height - 52, 150 * (hp / 100), 14);
    text('HP', 186, VIEW.height - 52, 14, PALETTE.text, 'left');
    text(moneyLabel(Math.round(game.player.money)), 28, VIEW.height - 30, 18, '#7ee081', 'left');
    // Bottom-right: ammo and speed.
    context.fillStyle = PALETTE.hudBg;
    roundRect(VIEW.width - 236, VIEW.height - 64, 220, 48, 8);
    context.fill();
    text(ammoLabel(game.player.ammo), VIEW.width - 224, VIEW.height - 52, 15, PALETTE.text, 'left');
    if (game.combat.reloading > 0) text('RELOADING…', VIEW.width - 224, VIEW.height - 30, 13, '#ff9a5c', 'left');
    else if (game.player.inCar) text(speedLabel(`${Math.round(Math.abs(game.player.inCar.speed) * 0.16)} km/h`), VIEW.width - 28, VIEW.height - 52, 18, PALETTE.text, 'right');
    else text('ON FOOT', VIEW.width - 28, VIEW.height - 52, 15, PALETTE.muted, 'right');
    if (game.player.inCar) text('E — get out   SPACE — handbrake', VIEW.width - 28, VIEW.height - 30, 12, PALETTE.muted, 'right');
    else text('E — steal car   CLICK — shoot', VIEW.width - 28, VIEW.height - 30, 12, PALETTE.muted, 'right');
    // Centre banner (mission changes, pickups).
    if (game.missions.bannerTime > 0 && game.missions.banner) {
      const alpha = Math.min(1, game.missions.bannerTime);
      context.globalAlpha = alpha;
      context.font = `bold 30px ${FONT}`;
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      const w = context.measureText(game.missions.banner).width + 48;
      context.fillStyle = PALETTE.panel;
      roundRect(VIEW.width / 2 - w / 2, 96, w, 52, 10);
      context.fill();
      context.strokeStyle = PALETTE.panelEdge;
      context.lineWidth = 2;
      roundRect(VIEW.width / 2 - w / 2, 96, w, 52, 10);
      context.stroke();
      context.fillStyle = PALETTE.text;
      context.fillText(game.missions.banner, VIEW.width / 2, 123);
      context.globalAlpha = 1;
    }
    // Crosshair while on foot.
    if (!game.player.inCar && game.mouse.seen) {
      const mx = (game.mouse.x * view.ratio - view.x) / view.scale;
      const my = (game.mouse.y * view.ratio - view.y) / view.scale;
      context.strokeStyle = 'rgba(255,255,255,0.9)';
      context.lineWidth = 2;
      context.beginPath();
      context.arc(mx, my, 9, 0, Math.PI * 2);
      context.stroke();
      context.beginPath();
      context.moveTo(mx - 13, my);
      context.lineTo(mx - 5, my);
      context.moveTo(mx + 5, my);
      context.lineTo(mx + 13, my);
      context.moveTo(mx, my - 13);
      context.lineTo(mx, my - 5);
      context.moveTo(mx, my + 5);
      context.lineTo(mx, my + 13);
      context.stroke();
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 640;
    const height = 150 + lines.length * 32 + 74;
    const x = (VIEW.width - width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = PALETTE.panel;
    roundRect(x, y, width, height, 14);
    context.fill();
    context.strokeStyle = accent || PALETTE.panelEdge;
    context.lineWidth = 2;
    roundRect(x, y, width, height, 14);
    context.stroke();
    text(title, VIEW.width / 2, y + 58, 44, PALETTE.text, 'center', 'middle');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], VIEW.width / 2, y + 118 + i * 32, 19, PALETTE.muted, 'center', 'middle');
    }
    text(prompt, VIEW.width / 2, y + height - 38, 20, PALETTE.marker, 'center', 'middle');
  }

  /** Paint one frame: the world through the camera, then the HUD or a panel. */
  function draw(game, screen, ui) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const cam = cameraFor(game);
    context.setTransform(view.scale, 0, 0, view.scale, -cam.x * view.scale, -cam.y * view.scale);
    drawGround(game, cam);
    drawMarker(game);
    drawPickups(game);
    for (const car of game.cars) {
      if (!car.dead) drawCar(game, car);
    }
    for (const ped of game.peds) drawPedestrian(game, ped);
    drawPlayer(game);
    drawBullets(game);
    drawParticles(game);
    drawDusk(cam);
    // Screen space: the HUD and the panels.
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_TITLE) {
      context.fillStyle = 'rgba(10,6,4,0.45)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      const lines = [
        STORY_LINE,
        '',
        'WASD / arrows — move & drive      Mouse — aim      Click — shoot',
        'E — enter / steal a car      R — reload      SPACE — handbrake',
        'P — pause      M — mute      Your progress saves itself.',
        ui.best > 0 ? `Best haul so far: $${ui.best}` : '',
      ];
      drawPanel(NAMES.game.toUpperCase(), lines, ui.hasSave ? 'ENTER — continue your story    N — new game' : 'Press ENTER or click to start', PALETTE.panelEdge);
      return;
    }
    drawHud(game);
    if (screen === SCREEN_PAUSED) {
      context.fillStyle = 'rgba(10,6,4,0.55)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      drawPanel('Paused', ['The city waits for you.', '', 'S — save now      Q — quit to title'], 'P — resume');
    } else if (screen === SCREEN_BUSTED) {
      context.fillStyle = 'rgba(10,6,4,0.6)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      drawPanel('CAUGHT', [`The police took $${ui.fine} off you and let you go.`, 'The heat is off — for now.'], 'Press ENTER to keep driving', '#4da3ff');
    } else if (screen === SCREEN_WASTED) {
      context.fillStyle = 'rgba(10,6,4,0.65)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      drawPanel('DOWN AND OUT', ['Dana wakes up at St. Anselm Hospital.', 'The city is still out there.'], 'Press ENTER to get back in', PALETTE.healthLow);
    } else if (screen === SCREEN_STORY) {
      context.fillStyle = 'rgba(10,6,4,0.5)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      drawPanel('STORY COMPLETE', [`All five jobs done. Haul: $${Math.round(game.player.money)}.`, 'Sunset Bay is yours, Dana.'], 'Press ENTER to keep roaming free', PALETTE.marker);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    draw,
    /** Canvas CSS pixels (a mouse position) to world units, through the camera. */
    screenToWorld(game, cssX, cssY) {
      const cam = cameraFor(game);
      return { x: cam.x + (cssX * view.ratio) / view.scale, y: cam.y + (cssY * view.ratio) / view.scale };
    },
  };
}

const STORY_LINE = 'Dana Voss came to Sunset Bay to drive — fast, quiet, no questions.';
