// Sound, synthesized live with WebAudio — no audio files, nothing over the network.
// An engine hum that follows the car's speed, a two-tone police siren, gunshots,
// pickups, crashes and mission jingles, all from oscillators and filtered noise.
export function createAudio() {
  const audio = {
    ctx: null,
    master: null,
    muted: false,
    engineOsc: null,
    engineGain: null,
    engineFilter: null,
    sirenOsc: null,
    sirenGain: null,
    sirenHigh: false,
    sirenTimer: 0,
    noiseBuffer: null,
  };
  return audio;
}

/** Build the audio graph on the first user gesture (browsers demand one). */
export function ensureAudio(audio) {
  if (audio.ctx) {
    if (audio.ctx.state === 'suspended') audio.ctx.resume();
    return;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return;
  const ctx = new Ctx();
  audio.ctx = ctx;
  audio.master = ctx.createGain();
  audio.master.gain.value = audio.muted ? 0 : 0.5;
  audio.master.connect(ctx.destination);
  // A one-second noise buffer, reused by every percussive sound.
  const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
  audio.noiseBuffer = buffer;
  // The engine: a sawtooth through a low-pass, its pitch following speed.
  audio.engineOsc = ctx.createOscillator();
  audio.engineOsc.type = 'sawtooth';
  audio.engineOsc.frequency.value = 55;
  audio.engineFilter = ctx.createBiquadFilter();
  audio.engineFilter.type = 'lowpass';
  audio.engineFilter.frequency.value = 320;
  audio.engineGain = ctx.createGain();
  audio.engineGain.gain.value = 0;
  audio.engineOsc.connect(audio.engineFilter);
  audio.engineFilter.connect(audio.engineGain);
  audio.engineGain.connect(audio.master);
  audio.engineOsc.start();
  // The siren: a square wave that alternates between two notes.
  audio.sirenOsc = ctx.createOscillator();
  audio.sirenOsc.type = 'square';
  audio.sirenOsc.frequency.value = 720;
  audio.sirenGain = ctx.createGain();
  audio.sirenGain.gain.value = 0;
  audio.sirenOsc.connect(audio.sirenGain);
  audio.sirenGain.connect(audio.master);
  audio.sirenOsc.start();
}

export function setMuted(audio, muted) {
  audio.muted = muted;
  if (audio.master) audio.master.gain.value = muted ? 0 : 0.5;
}

/** A short tone: frequency, duration, shape and volume. */
function blip(audio, freq, duration, type, volume, when = 0) {
  if (!audio.ctx) return;
  const t0 = audio.ctx.currentTime + when;
  const osc = audio.ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const gain = audio.ctx.createGain();
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.connect(gain);
  gain.connect(audio.master);
  osc.start(t0);
  osc.stop(t0 + duration + 0.02);
}

/** A burst of filtered noise: gunshots, crashes, skids. */
function noiseBurst(audio, duration, filterFreq, volume, type = 'lowpass') {
  if (!audio.ctx) return;
  const t0 = audio.ctx.currentTime;
  const src = audio.ctx.createBufferSource();
  src.buffer = audio.noiseBuffer;
  const filter = audio.ctx.createBiquadFilter();
  filter.type = type;
  filter.frequency.value = filterFreq;
  const gain = audio.ctx.createGain();
  gain.gain.setValueAtTime(volume, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  src.connect(filter);
  filter.connect(gain);
  gain.connect(audio.master);
  src.start(t0);
  src.stop(t0 + duration + 0.02);
}

export const sfxShot = (audio) => noiseBurst(audio, 0.14, 2400, 0.5, 'highpass');
export const sfxCrash = (audio) => noiseBurst(audio, 0.25, 300, 0.6);
export const sfxSkid = (audio) => noiseBurst(audio, 0.2, 900, 0.12, 'bandpass');
export const sfxPickup = (audio) => {
  blip(audio, 880, 0.09, 'sine', 0.25);
  blip(audio, 1318, 0.14, 'sine', 0.25, 0.07);
};
export const sfxMission = (audio) => {
  [523, 659, 784, 1046].forEach((f, i) => blip(audio, f, 0.22, 'triangle', 0.3, i * 0.11));
};
export const sfxBusted = (audio) => {
  [392, 330, 262, 196].forEach((f, i) => blip(audio, f, 0.3, 'sawtooth', 0.22, i * 0.16));
};
export const sfxClick = (audio) => blip(audio, 660, 0.05, 'square', 0.12);

/**
 * Per-frame audio: the engine follows the driven car's speed and the siren wails
 * while police are close. Call every frame with the live game state.
 */
export function updateAudio(audio, dt, driving, speedRatio, policeNear) {
  if (!audio.ctx) return;
  const engineTarget = driving ? 0.05 + speedRatio * 0.06 : 0;
  audio.engineGain.gain.setTargetAtTime(engineTarget, audio.ctx.currentTime, 0.1);
  audio.engineOsc.frequency.setTargetAtTime(52 + speedRatio * 165, audio.ctx.currentTime, 0.08);
  audio.engineFilter.frequency.setTargetAtTime(300 + speedRatio * 900, audio.ctx.currentTime, 0.1);
  const sirenTarget = policeNear ? 0.045 : 0;
  audio.sirenGain.gain.setTargetAtTime(sirenTarget, audio.ctx.currentTime, 0.2);
  if (policeNear) {
    audio.sirenTimer -= dt;
    if (audio.sirenTimer <= 0) {
      audio.sirenTimer = 0.42;
      audio.sirenHigh = !audio.sirenHigh;
      audio.sirenOsc.frequency.setTargetAtTime(audio.sirenHigh ? 960 : 720, audio.ctx.currentTime, 0.05);
    }
  }
}
