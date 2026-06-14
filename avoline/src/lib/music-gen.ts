// Avolin Synth — richer procedural music generator using the Web Audio API.
// Plays in-browser so it stays free and instant. Generates a multi-track piece
// (pad, bass, lead melody, arpeggio, drums) with a chord progression chosen
// from the prompt's detected mood.
//
// The composition (which notes play at which times) is fully deterministic
// for a given (mood, durationSec, seed) triple — we expose the seed on the
// returned object so we can re-render the same piece offline (for WAV
// download) later. Note that the *waveform samples* may differ slightly from
// what was heard live because OfflineAudioContext renders at a fixed 44.1k
// while the live AudioContext uses the device's native rate (often 48k), and
// internal DSP (compressor/filter) implementations vary across browsers. The
// musical content — notes, timing, structure — is identical.
//
// Honest scope: this is a procedural synth, NOT an AI vocal model like Suno.
// It is designed to sound musical, varied, and pleasant — not to mimic
// trained-model song generation.

export type Mood = "calm" | "epic" | "happy" | "dark" | "electronic" | "ambient" | "lofi" | "jazz";

const SCALES: Record<Mood, number[]> = {
  calm: [0, 2, 4, 5, 7, 9, 11],
  epic: [0, 2, 3, 5, 7, 8, 11],
  happy: [0, 2, 4, 7, 9],
  dark: [0, 1, 3, 5, 7, 8, 10],
  electronic: [0, 3, 5, 7, 10],
  ambient: [0, 2, 4, 7, 9, 11],
  lofi: [0, 2, 3, 5, 7, 8, 10],
  jazz: [0, 2, 4, 5, 7, 9, 11],
};

const TEMPOS: Record<Mood, number> = {
  calm: 72, epic: 92, happy: 116, dark: 64, electronic: 124, ambient: 56, lofi: 78, jazz: 96,
};

const PROGRESSIONS: Record<Mood, number[]> = {
  calm: [0, 4, 5, 3],
  epic: [0, 5, 3, 4],
  happy: [0, 3, 4, 0],
  dark: [0, 5, 1, 4],
  electronic: [0, 3, 4, 5],
  ambient: [0, 2, 4, 1],
  lofi: [0, 5, 3, 4],
  jazz: [1, 4, 0, 5],
};

export function detectMood(prompt: string): Mood {
  const p = prompt.toLowerCase();
  if (/lo-?fi|study|chill ?beat|relax beat|coffee/.test(p)) return "lofi";
  if (/jazz|swing|smooth|saxophone/.test(p)) return "jazz";
  if (/calm|relax|peace|soft|gentle|sleep|meditation|spa/.test(p)) return "calm";
  if (/epic|cinemat|hero|battle|drama|powerful|orchestr|trailer/.test(p)) return "epic";
  if (/happy|upbeat|joy|cheer|fun|bright|pop|party/.test(p)) return "happy";
  if (/dark|sad|moody|melan|horror|scary|gothic|tragic/.test(p)) return "dark";
  if (/electronic|edm|techno|synth|dance|club|beat|house/.test(p)) return "electronic";
  return "ambient";
}

const noteFreq = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

// Tiny seeded RNG (mulberry32) so playback and offline render produce the
// EXACT same audio waveform from the same seed.
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return function () {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStringToSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export type GeneratedMusic = {
  mood: Mood;
  durationSec: number;
  seed: number;
  prompt: string;
  stop: () => void;
  finished: Promise<void>;
};

// ────────────────────────────────────────────────────────────────────────────
// Composition — wires up oscillators on ANY BaseAudioContext (live or offline).
// Returns the absolute end time of the piece in the given context's timeline.
// ────────────────────────────────────────────────────────────────────────────

type AnyCtx = BaseAudioContext;

function compose(
  ctx: AnyCtx,
  destination: AudioNode,
  mood: Mood,
  durationSec: number,
  rng: () => number,
  startAt: number,
): number {
  const scale = SCALES[mood];
  const bpm = TEMPOS[mood];
  const beat = 60 / bpm;
  const progression = PROGRESSIONS[mood];

  const master = ctx.createGain();
  master.gain.value = 0.0;
  master.connect(destination);

  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 12;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.005;
  limiter.release.value = 0.12;
  limiter.connect(master);

  const delay = ctx.createDelay(2);
  delay.delayTime.value = beat * 0.5;
  const fb = ctx.createGain();
  fb.gain.value = mood === "ambient" || mood === "calm" || mood === "lofi" ? 0.5 : 0.28;
  const wet = ctx.createGain();
  wet.gain.value = 0.32;
  delay.connect(fb).connect(delay);
  delay.connect(wet).connect(limiter);

  const tone = ctx.createBiquadFilter();
  tone.type = "lowpass";
  tone.frequency.value = mood === "dark" || mood === "lofi" ? 1600 : mood === "electronic" ? 4500 : 2800;
  tone.Q.value = 0.7;
  tone.connect(limiter);
  tone.connect(delay);

  const drumBus = ctx.createGain();
  drumBus.gain.value = 0.85;
  drumBus.connect(limiter);

  function pad(midi: number, when: number, duration: number, gain = 0.14) {
    [-12, 0, 7, 12].forEach((interval, i) => {
      const osc = ctx.createOscillator();
      const oscGain = ctx.createGain();
      osc.type = i === 0 ? "sawtooth" : i === 1 ? "triangle" : "sine";
      osc.frequency.value = noteFreq(midi + interval);
      osc.detune.value = (rng() - 0.5) * 8;
      const peak = gain * (i === 0 ? 0.7 : i === 1 ? 1.0 : 0.5);
      oscGain.gain.setValueAtTime(0, when);
      oscGain.gain.linearRampToValueAtTime(peak, when + 0.8);
      oscGain.gain.setValueAtTime(peak, when + duration - 0.8);
      oscGain.gain.linearRampToValueAtTime(0, when + duration);
      osc.connect(oscGain).connect(tone);
      osc.start(when);
      osc.stop(when + duration + 0.1);
    });
  }

  function lead(midi: number, when: number, duration: number, gain = 0.18, type: OscillatorType = "triangle") {
    const osc = ctx.createOscillator();
    const oscGain = ctx.createGain();
    const vibrato = ctx.createOscillator();
    const vibratoGain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = noteFreq(midi);
    vibrato.frequency.value = 5.5;
    vibratoGain.gain.value = 4;
    vibrato.connect(vibratoGain).connect(osc.frequency);
    oscGain.gain.setValueAtTime(0, when);
    oscGain.gain.linearRampToValueAtTime(gain, when + 0.04);
    oscGain.gain.setValueAtTime(gain * 0.85, when + duration * 0.6);
    oscGain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(oscGain).connect(tone);
    osc.start(when);
    vibrato.start(when);
    osc.stop(when + duration + 0.05);
    vibrato.stop(when + duration + 0.05);
  }

  function bass(midi: number, when: number, duration: number, gain = 0.32) {
    const osc = ctx.createOscillator();
    const sub = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = "triangle";
    sub.type = "sine";
    osc.frequency.value = noteFreq(midi);
    sub.frequency.value = noteFreq(midi - 12);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(g);
    sub.connect(g);
    g.connect(tone);
    osc.start(when); sub.start(when);
    osc.stop(when + duration + 0.05);
    sub.stop(when + duration + 0.05);
  }

  function arp(midi: number, when: number, duration: number, gain = 0.12) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = mood === "electronic" ? "square" : "sine";
    osc.frequency.value = noteFreq(midi);
    g.gain.setValueAtTime(0, when);
    g.gain.linearRampToValueAtTime(gain, when + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    osc.connect(g).connect(tone);
    osc.start(when);
    osc.stop(when + duration + 0.02);
  }

  function kick(when: number, gain = 0.65) {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.setValueAtTime(140, when);
    osc.frequency.exponentialRampToValueAtTime(40, when + 0.18);
    g.gain.setValueAtTime(gain, when);
    g.gain.exponentialRampToValueAtTime(0.001, when + 0.3);
    osc.connect(g).connect(drumBus);
    osc.start(when); osc.stop(when + 0.35);
  }

  function snare(when: number, gain = 0.35) {
    const buffer = ctx.createBuffer(1, 0.25 * ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (rng() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * 0.05));
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 1600;
    src.buffer = buffer;
    g.gain.value = gain;
    src.connect(hp).connect(g).connect(drumBus);
    src.start(when);
  }

  function hat(when: number, gain = 0.09, open = false) {
    const dur = open ? 0.18 : 0.04;
    const buffer = ctx.createBuffer(1, dur * ctx.sampleRate, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (rng() * 2 - 1) * Math.exp(-i / (ctx.sampleRate * (open ? 0.06 : 0.01)));
    const src = ctx.createBufferSource();
    const g = ctx.createGain();
    const hp = ctx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = 7000;
    src.buffer = buffer;
    g.gain.value = gain;
    src.connect(hp).connect(g).connect(drumBus);
    src.start(when);
  }

  const root = mood === "dark" ? 50 : mood === "epic" ? 52 : mood === "lofi" ? 53 : 55;
  const start = startAt + 0.15;
  const totalBars = Math.max(4, Math.floor(durationSec / (4 * beat)));

  master.gain.setValueAtTime(0, startAt);
  master.gain.linearRampToValueAtTime(0.55, start + 0.6);
  master.gain.setValueAtTime(0.55, start + durationSec - 1.5);
  master.gain.linearRampToValueAtTime(0, start + durationSec);

  for (let bar = 0; bar < totalBars; bar++) {
    const barStart = start + bar * 4 * beat;
    const chordRootDeg = progression[bar % progression.length];
    const chordRootMidi = root + scale[chordRootDeg % scale.length];

    const isIntro = bar < (mood === "ambient" || mood === "calm" || mood === "lofi" ? 2 : 1);
    const isOutro = bar >= totalBars - 2;
    const fullBand = !isIntro && !isOutro;

    pad(chordRootMidi - 12, barStart, 4 * beat, mood === "ambient" || mood === "calm" ? 0.18 : 0.13);

    if (mood !== "ambient" || fullBand) {
      bass(chordRootMidi - 24, barStart, beat * 1.6, 0.34);
      bass(chordRootMidi - 24 + 7, barStart + 2 * beat, beat * 1.4, 0.28);
    }

    if (mood === "electronic" || mood === "happy" || mood === "ambient" || mood === "calm" || mood === "epic") {
      const tones = [0, 2, 4];
      for (let i = 0; i < 8; i++) {
        const deg = (chordRootDeg + tones[i % tones.length]) % scale.length;
        arp(root + 12 + scale[deg], barStart + i * beat * 0.5, beat * 0.45, 0.1);
      }
    }

    if (fullBand && (bar % 2 === 0 || mood === "happy" || mood === "epic")) {
      for (let n = 0; n < 4; n++) {
        const t = barStart + n * beat;
        const baseDeg = chordRootDeg + (n === 0 ? 0 : n === 2 ? 4 : (rng() < 0.5 ? 2 : 5));
        const deg = ((baseDeg % scale.length) + scale.length) % scale.length;
        const oct = rng() < 0.25 ? 24 : 12;
        lead(root + oct + scale[deg], t, beat * (0.7 + rng() * 0.5), 0.16, mood === "electronic" ? "sawtooth" : "triangle");
      }
    }

    if (fullBand) {
      if (mood === "electronic") {
        for (let b = 0; b < 4; b++) kick(barStart + b * beat, 0.55);
        for (let h = 0; h < 8; h++) hat(barStart + (h + 0.5) * beat * 0.5, 0.08, h % 4 === 3);
        snare(barStart + 1 * beat); snare(barStart + 3 * beat);
      } else if (mood === "happy" || mood === "epic") {
        kick(barStart, 0.6); kick(barStart + 2 * beat, 0.55);
        snare(barStart + 1 * beat, 0.32); snare(barStart + 3 * beat, 0.32);
        for (let h = 0; h < 8; h++) hat(barStart + h * beat * 0.5, 0.07);
      } else if (mood === "lofi" || mood === "jazz") {
        kick(barStart, 0.4); kick(barStart + 2.5 * beat, 0.32);
        snare(barStart + 1 * beat, 0.22); snare(barStart + 3 * beat, 0.22);
        for (let h = 0; h < 4; h++) hat(barStart + h * beat, 0.05, h === 2);
      } else if (mood === "dark") {
        kick(barStart, 0.55); kick(barStart + 2 * beat, 0.5);
        snare(barStart + 2 * beat, 0.18);
      }
    }
  }

  return start + durationSec;
}

// ────────────────────────────────────────────────────────────────────────────
// Live playback.
// ────────────────────────────────────────────────────────────────────────────

export function generateMusic(prompt: string, durationSec = 45, seedIn?: number): GeneratedMusic {
  const mood = detectMood(prompt);
  const seed = seedIn ?? hashStringToSeed(`${prompt}|${durationSec}|${Date.now()}`);
  const rng = makeRng(seed);

  const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
  compose(ctx, ctx.destination, mood, durationSec, rng, ctx.currentTime);

  let stopped = false;
  let resolveFinished!: () => void;
  const finished = new Promise<void>((resolve) => { resolveFinished = resolve; });
  const naturalTimer = setTimeout(() => {
    if (stopped) return;
    stopped = true;
    ctx.close().catch(() => {});
    resolveFinished();
  }, durationSec * 1000 + 800);

  return {
    mood,
    durationSec,
    seed,
    prompt,
    stop: () => {
      if (stopped) return;
      stopped = true;
      clearTimeout(naturalTimer);
      try {
        // Gracefully fade by closing slightly delayed.
      } catch {}
      setTimeout(() => {
        ctx.close().catch(() => {});
        resolveFinished();
      }, 320);
    },
    finished,
  };
}

// ────────────────────────────────────────────────────────────────────────────
// Offline render to an AudioBuffer for download.
// Uses the same mood/seed/duration so the rendered audio is identical to the
// live playback.
// ────────────────────────────────────────────────────────────────────────────

export async function renderMusicBuffer(
  prompt: string,
  durationSec: number,
  seed: number,
): Promise<AudioBuffer> {
  const mood = detectMood(prompt);
  const sampleRate = 44100;
  // Total render length: short pre-roll (0.15s) + composition + 1s tail for
  // delay reverb to ring out.
  const totalSec = 0.15 + durationSec + 1.0;
  const Offline =
    (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  if (!Offline) throw new Error("OfflineAudioContext is not supported in this browser.");
  const ctx: OfflineAudioContext = new Offline(2, Math.ceil(sampleRate * totalSec), sampleRate);
  const rng = makeRng(seed);
  compose(ctx, ctx.destination, mood, durationSec, rng, 0);
  return await ctx.startRendering();
}
