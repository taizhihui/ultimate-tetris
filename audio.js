// Chiptune soundtrack + SFX synthesized with the Web Audio API.
// No external files — every sound is generated on the fly with oscillators.
(() => {
  let ctx = null;
  let musicGain = null;
  let sfxGain = null;
  let musicEnabled = true;
  let sfxEnabled = true;
  let musicTimer = null;
  let musicStep = 0;
  let musicStartTime = 0;
  let playing = false;
  let gameRunning = false; // whether the caller considers the game active

  // Frequencies (Hz) for a small chromatic set, keyed by note + octave.
  const N = (() => {
    const base = { C: -9, 'C#': -8, D: -7, 'D#': -6, E: -5, F: -4, 'F#': -3, G: -2, 'G#': -1, A: 0, 'A#': 1, B: 2 };
    const out = {};
    for (const [n, semi] of Object.entries(base)) {
      for (let oct = 2; oct <= 6; oct++) {
        const semitones = semi + (oct - 4) * 12;
        out[n + oct] = 440 * Math.pow(2, semitones / 12);
      }
    }
    out.REST = 0;
    return out;
  })();

  // 16th-note grid. Each entry is [melodyNote, bassNote]. REST = silence.
  // Loops forever. Roughly 4 bars of upbeat C-major chiptune.
  const TEMPO_BPM = 140;
  const STEP_SEC = 60 / TEMPO_BPM / 4; // 16th note
  const PATTERN = [
    ['C5', 'C3'], ['E5', 'REST'], ['G5', 'G3'], ['E5', 'REST'],
    ['C5', 'C3'], ['E5', 'REST'], ['G5', 'G3'], ['C6', 'REST'],
    ['B5', 'A2'], ['G5', 'REST'], ['E5', 'E3'], ['G5', 'REST'],
    ['A5', 'A2'], ['REST', 'REST'], ['G5', 'E3'], ['E5', 'REST'],

    ['F5', 'F3'], ['A5', 'REST'], ['C6', 'C4'], ['A5', 'REST'],
    ['F5', 'F3'], ['A5', 'REST'], ['C6', 'C4'], ['REST', 'REST'],
    ['E5', 'G3'], ['D5', 'REST'], ['C5', 'G3'], ['D5', 'REST'],
    ['E5', 'G2'], ['G5', 'REST'], ['F5', 'G3'], ['D5', 'REST'],

    ['E5', 'C3'], ['G5', 'REST'], ['C6', 'G3'], ['E5', 'REST'],
    ['G5', 'C3'], ['C6', 'REST'], ['E6', 'G3'], ['C6', 'REST'],
    ['B5', 'A2'], ['A5', 'REST'], ['G5', 'E3'], ['A5', 'REST'],
    ['B5', 'A2'], ['C6', 'REST'], ['B5', 'E3'], ['G5', 'REST'],

    ['A5', 'F3'], ['G5', 'REST'], ['F5', 'C3'], ['E5', 'REST'],
    ['D5', 'G3'], ['E5', 'REST'], ['F5', 'G3'], ['D5', 'REST'],
    ['C5', 'C3'], ['E5', 'G3'], ['G5', 'C3'], ['E5', 'G3'],
    ['C5', 'C3'], ['REST', 'REST'], ['G4', 'G2'], ['REST', 'REST'],
  ];

  function ensureContext() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    musicGain = ctx.createGain();
    musicGain.gain.value = musicEnabled ? 0.18 : 0;
    musicGain.connect(ctx.destination);
    sfxGain = ctx.createGain();
    sfxGain.gain.value = sfxEnabled ? 0.22 : 0;
    sfxGain.connect(ctx.destination);
    return ctx;
  }

  function playTone(freq, start, duration, type, gain, bus) {
    if (!freq || !ctx) return;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    // short attack + exponential decay for a plucky chiptune feel
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(gain, start + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(g);
    g.connect(bus);
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }

  function scheduleStep() {
    if (!playing || !ctx) return;
    const now = ctx.currentTime;
    const scheduleAheadSec = 0.12;
    while (musicStartTime + musicStep * STEP_SEC < now + scheduleAheadSec) {
      const t = musicStartTime + musicStep * STEP_SEC;
      const [mel, bass] = PATTERN[musicStep % PATTERN.length];
      playTone(N[mel], t, STEP_SEC * 0.9, 'square', 0.14, musicGain);
      playTone(N[bass], t, STEP_SEC * 1.8, 'triangle', 0.22, musicGain);
      musicStep++;
    }
  }

  function startMusic() {
    gameRunning = true;
    if (!musicEnabled) return;
    if (!ensureContext()) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (playing) return;
    playing = true;
    musicStep = 0;
    musicStartTime = ctx.currentTime + 0.05;
    scheduleStep();
    musicTimer = setInterval(scheduleStep, 40);
  }

  function stopMusic() {
    gameRunning = false;
    haltMusic();
  }

  function haltMusic() {
    playing = false;
    if (musicTimer) {
      clearInterval(musicTimer);
      musicTimer = null;
    }
  }

  function setMusicEnabled(v) {
    musicEnabled = !!v;
    if (musicGain) {
      musicGain.gain.setTargetAtTime(musicEnabled ? 0.18 : 0, ctx.currentTime, 0.02);
    }
    if (musicEnabled && gameRunning && !playing) startMusic();
    else if (!musicEnabled) haltMusic();
  }

  function setSfxEnabled(v) {
    sfxEnabled = !!v;
    if (sfxGain) {
      sfxGain.gain.setTargetAtTime(sfxEnabled ? 0.22 : 0, ctx.currentTime, 0.02);
    }
  }

  function toggleMusic() { setMusicEnabled(!musicEnabled); return musicEnabled; }
  function toggleSfx()   { setSfxEnabled(!sfxEnabled); return sfxEnabled; }

  // --- SFX ---
  function sfx(notes, type = 'square', gain = 0.3) {
    if (!sfxEnabled) return;
    if (!ensureContext()) return;
    if (ctx.state === 'suspended') ctx.resume();
    let t = ctx.currentTime;
    for (const [freq, dur] of notes) {
      playTone(freq, t, dur, type, gain, sfxGain);
      t += dur;
    }
  }

  function sfxMove()     { sfx([[N.E5, 0.04]], 'square', 0.18); }
  function sfxRotate()   { sfx([[N.G5, 0.05]], 'square', 0.18); }
  function sfxLock()     { sfx([[N.C4, 0.06]], 'triangle', 0.28); }
  function sfxLine()     { sfx([[N.C5, 0.07], [N.E5, 0.07], [N.G5, 0.07], [N.C6, 0.12]], 'square', 0.25); }
  function sfxTetris()   { sfx([[N.C5, 0.06], [N.E5, 0.06], [N.G5, 0.06], [N.C6, 0.06], [N.E6, 0.14]], 'square', 0.28); }
  function sfxLevelUp()  { sfx([[N.G5, 0.08], [N.C6, 0.08], [N.E6, 0.16]], 'square', 0.28); }
  function sfxGameOver() { sfx([[N.C5, 0.14], [N.B4, 0.14], [N.A4, 0.14], [N.G4, 0.14], [N.F4, 0.14], [N.E4, 0.28]], 'square', 0.26); }

  window.GameAudio = {
    startMusic,
    stopMusic,
    setMusicEnabled,
    setSfxEnabled,
    toggleMusic,
    toggleSfx,
    isMusicEnabled: () => musicEnabled,
    isSfxEnabled: () => sfxEnabled,
    sfxMove, sfxRotate, sfxLock, sfxLine, sfxTetris, sfxLevelUp, sfxGameOver,
  };
})();
