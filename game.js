/* Sky Stack - a one-tap stacking game for YouTube Playables. */
(() => {
  'use strict';

  // ---------------------------------------------------------------------------
  // SDK wrapper. The SDK is a no-op when served locally; these guards also keep
  // the game working if the script could not be loaded at all.
  // ---------------------------------------------------------------------------
  const yt = window.ytgame || null;
  const SDK = {
    inEnv: !!(yt && yt.IN_PLAYABLES_ENV),
    firstFrameReady() { try { yt && yt.game.firstFrameReady(); } catch (e) {} },
    gameReady() { try { yt && yt.game.gameReady(); } catch (e) {} },
    async loadData() {
      if (!yt) return '';
      try { return (await yt.game.loadData()) || ''; } catch (e) { SDK.logWarning(); return ''; }
    },
    async saveData(str) {
      if (!yt) return;
      try { await yt.game.saveData(str); } catch (e) { SDK.logWarning(); }
    },
    async getLanguage() {
      if (!yt) return 'en';
      try { return (await yt.system.getLanguage()) || 'en'; } catch (e) { return 'en'; }
    },
    isAudioEnabled() {
      if (!SDK.inEnv) return true;
      try { return !!yt.system.isAudioEnabled(); } catch (e) { return false; }
    },
    // Outside Playables the no-op SDK reports audio as disabled; only listen in the real env.
    onAudioEnabledChange(cb) { try { SDK.inEnv && yt.system.onAudioEnabledChange(cb); } catch (e) {} },
    onPause(cb) { try { yt && yt.system.onPause(cb); } catch (e) {} },
    onResume(cb) { try { yt && yt.system.onResume(cb); } catch (e) {} },
    sendScore(value) {
      if (!yt) return;
      try { yt.engagement.sendScore({ value }).catch(() => {}); } catch (e) {}
    },
    // Ads: only YouTube-provided ad functions are allowed.
    async interstitial() {
      if (!SDK.inEnv) return;
      try { await yt.ads.requestInterstitialAd(); } catch (e) {}
    },
    async rewarded(rewardId) {
      // Outside Playables there is no ad; grant the reward so the flow can be tested.
      if (!SDK.inEnv) return new Promise((r) => setTimeout(() => r(true), 400));
      try { return !!(await yt.ads.requestRewardedAd(rewardId)); } catch (e) { return false; }
    },
    logError() { try { yt && yt.health.logError(); } catch (e) {} },
    logWarning() { try { yt && yt.health.logWarning(); } catch (e) {} },
  };

  window.addEventListener('error', () => SDK.logError());
  window.addEventListener('unhandledrejection', () => SDK.logError());

  // ---------------------------------------------------------------------------
  // Localization (language comes only from ytgame.system.getLanguage)
  // ---------------------------------------------------------------------------
  const STRINGS = {
    en: { title: 'SKY STACK', cont: 'Continue (watch ad)', again: 'Play again', tap: 'Tap to play', retry: 'Tap to play again', best: 'BEST', score: 'SCORE',
      perfect: 'PERFECT', over: 'GAME OVER', newBest: 'NEW BEST!', loading: 'Loading…', hint: 'Tap, click or press Space to drop' },
    tr: { title: 'SKY STACK', cont: 'Devam et (reklam izle)', again: 'Tekrar oyna', tap: 'Oynamak için dokun', retry: 'Tekrar oynamak için dokun', best: 'EN İYİ', score: 'SKOR',
      perfect: 'MÜKEMMEL', over: 'OYUN BİTTİ', newBest: 'YENİ REKOR!', loading: 'Yükleniyor…', hint: 'Bırakmak için dokun, tıkla veya Boşluk' },
    es: { title: 'SKY STACK', cont: 'Continuar (ver anuncio)', again: 'Jugar otra vez', tap: 'Toca para jugar', retry: 'Toca para jugar otra vez', best: 'MEJOR', score: 'PUNTOS',
      perfect: 'PERFECTO', over: 'FIN DEL JUEGO', newBest: '¡NUEVO RÉCORD!', loading: 'Cargando…', hint: 'Toca, haz clic o pulsa Espacio' },
    pt: { title: 'SKY STACK', cont: 'Continuar (ver anúncio)', again: 'Jogar de novo', tap: 'Toque para jogar', retry: 'Toque para jogar de novo', best: 'MELHOR', score: 'PONTOS',
      perfect: 'PERFEITO', over: 'FIM DE JOGO', newBest: 'NOVO RECORDE!', loading: 'Carregando…', hint: 'Toque, clique ou aperte Espaço' },
    de: { title: 'SKY STACK', cont: 'Weiter (Werbung ansehen)', again: 'Nochmal spielen', tap: 'Tippen zum Spielen', retry: 'Tippen für neues Spiel', best: 'BESTE', score: 'PUNKTE',
      perfect: 'PERFEKT', over: 'SPIEL VORBEI', newBest: 'NEUER REKORD!', loading: 'Lädt…', hint: 'Tippen, klicken oder Leertaste' },
    fr: { title: 'SKY STACK', cont: 'Continuer (voir une pub)', again: 'Rejouer', tap: 'Touchez pour jouer', retry: 'Touchez pour rejouer', best: 'RECORD', score: 'SCORE',
      perfect: 'PARFAIT', over: 'PARTIE TERMINÉE', newBest: 'NOUVEAU RECORD !', loading: 'Chargement…', hint: 'Touchez, cliquez ou Espace' },
  };
  let L = STRINGS.en;
  function setLanguage(tag) {
    const code = String(tag || 'en').toLowerCase().split(/[-_]/)[0];
    L = STRINGS[code] || STRINGS.en;
  }

  // ---------------------------------------------------------------------------
  // Save data (cloud save only, via ytgame.game.saveData / loadData)
  // ---------------------------------------------------------------------------
  const SAVE_VERSION = 1;
  const save = { best: 0, games: 0, totalLayers: 0, bestCombo: 0 };
  let saveLoaded = false;
  let saveDirty = false;
  let saving = Promise.resolve();

  function parseSave(str) {
    if (!str) return;
    try {
      const d = JSON.parse(str);
      if (!d || typeof d !== 'object') return;
      // Every version so far shares these fields; unknown fields are ignored.
      save.best = Math.max(0, d.best | 0);
      save.games = Math.max(0, d.games | 0);
      save.totalLayers = Math.max(0, d.totalLayers | 0);
      save.bestCombo = Math.max(0, d.bestCombo | 0);
    } catch (e) { SDK.logWarning(); }
  }

  function persist() {
    if (!saveLoaded || !saveDirty) return saving;
    saveDirty = false;
    const payload = JSON.stringify({ v: SAVE_VERSION, ...save });
    saving = saving.then(() => SDK.saveData(payload));
    return saving;
  }

  // ---------------------------------------------------------------------------
  // Audio (procedural WebAudio, respects ytgame.system.isAudioEnabled)
  // ---------------------------------------------------------------------------
  let audioEnabled = SDK.isAudioEnabled();
  let actx = null;
  let master = null;

  function ensureAudio() {
    if (!audioEnabled || paused || adBusy) return null;
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        actx = new AC();
        master = actx.createGain();
        master.gain.value = 0.5;
        master.connect(actx.destination);
      } catch (e) { actx = null; return null; }
    }
    if (actx.state === 'suspended') actx.resume().catch(() => {});
    return actx;
  }

  function updateAudioState() {
    if (!actx) return;
    if (audioEnabled && !paused && !adBusy) actx.resume().catch(() => {});
    else actx.suspend().catch(() => {});
  }

  function tone(freq, dur, type = 'sine', vol = 0.3, when = 0, slideTo = 0) {
    const ctx = ensureAudio();
    if (!ctx) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  // Sound effects stay in A minor pentatonic so they blend with the music.
  const SCALE = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24];
  const sfx = {
    place(n) { tone(220 * Math.pow(2, SCALE[n % 6] / 12), 0.12, 'triangle', 0.22); },
    perfect(combo) {
      const base = 440;
      const step = SCALE[Math.min(combo - 1, SCALE.length - 1)];
      tone(base * Math.pow(2, step / 12), 0.25, 'sine', 0.28);
      tone(base * Math.pow(2, (step + 7) / 12), 0.3, 'sine', 0.16, 0.06);
    },
    cut() { tone(160, 0.18, 'square', 0.08, 0, 70); },
    over() {
      tone(659, 0.2, 'triangle', 0.25);
      tone(523, 0.25, 'triangle', 0.25, 0.15);
      tone(440, 0.6, 'triangle', 0.25, 0.32, 330);
    },
    start() { tone(440, 0.12, 'sine', 0.2); tone(659, 0.18, 'sine', 0.2, 0.08); },
  };

  // ---------------------------------------------------------------------------
  // Music: a procedural loop (Am - F - C - G) scheduled from the game loop, so
  // it stops with everything else on pause. Layers build up as the tower grows.
  // ---------------------------------------------------------------------------
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const CHORDS = [
    { bass: 45, notes: [57, 60, 64] }, // Am
    { bass: 41, notes: [57, 60, 65] }, // F
    { bass: 48, notes: [55, 60, 64] }, // C
    { bass: 43, notes: [55, 59, 62] }, // G
  ];
  const ARP = [0, 1, 2, 1, 0, 2, 1, 2];
  const MUSIC_VOL = 0.2;

  const music = {
    bus: null,
    pad: null,
    noise: null,
    bpm: 100,
    step: 0,
    nextTime: 0,

    init() {
      this.bus = actx.createGain();
      this.bus.gain.value = MUSIC_VOL;
      this.bus.connect(master);
      this.pad = actx.createBiquadFilter();
      this.pad.type = 'lowpass';
      this.pad.frequency.value = 1100;
      this.pad.connect(this.bus);
      const len = Math.floor(actx.sampleRate * 0.1);
      this.noise = actx.createBuffer(1, len, actx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.nextTime = actx.currentTime + 0.1;
    },

    // 0 = calm (menu / game over), 1 = playing, 2 = high tower
    intensity() {
      if (state !== 'playing') return 0;
      return score >= 20 ? 2 : 1;
    },

    // Called every frame: schedules notes slightly ahead of time.
    tick() {
      if (!actx || !audioEnabled || paused || adBusy || actx.state !== 'running') return;
      if (!this.bus) this.init();
      const now = actx.currentTime;
      const target = state === 'over' ? MUSIC_VOL * 0.45 : MUSIC_VOL;
      this.bus.gain.setTargetAtTime(target, now, 0.3);
      if (this.nextTime < now) this.nextTime = now + 0.05;
      const stepDur = 60 / this.bpm / 4;
      while (this.nextTime < now + 0.2) {
        this.playStep(this.step, this.nextTime, stepDur);
        this.nextTime += stepDur;
        this.step = (this.step + 1) % 64;
      }
    },

    playStep(step, t, sd) {
      const chord = CHORDS[Math.floor(step / 16)];
      const s = step % 16;
      const level = this.intensity();

      if (s === 0) {
        for (const n of chord.notes) this.voice(mtof(n), t, sd * 16, 'triangle', 0.09, 0.5, this.pad);
      }
      if (s === 0 || s === 6 || s === 8 || s === 14) {
        this.voice(mtof(chord.bass), t, sd * 2.5, 'sine', 0.5, 0.01);
      }
      if (level >= 1 && s % 2 === 0) {
        const n = chord.notes[ARP[(s / 2) % ARP.length]] + (level >= 2 ? 24 : 12);
        this.voice(mtof(n), t, sd * 1.6, 'square', 0.035, 0.005, this.pad);
      }
      if (level >= 1 && (s === 0 || s === 8)) this.kick(t);
      if (level >= 2 && s % 4 === 2) this.hat(t);
    },

    voice(freq, t, dur, type, vol, attack, dest = this.bus) {
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(dest);
      o.start(t);
      o.stop(t + dur + 0.05);
    },

    kick(t) {
      const o = actx.createOscillator();
      const g = actx.createGain();
      o.frequency.setValueAtTime(130, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.15);
      g.gain.setValueAtTime(0.6, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g).connect(this.bus);
      o.start(t);
      o.stop(t + 0.25);
    },

    hat(t) {
      const src = actx.createBufferSource();
      src.buffer = this.noise;
      const f = actx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = 7000;
      const g = actx.createGain();
      g.gain.setValueAtTime(0.12, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      src.connect(f).connect(g).connect(this.bus);
      src.start(t);
      src.stop(t + 0.06);
    },
  };

  // ---------------------------------------------------------------------------
  // Canvas & layout. Works in every aspect ratio and keeps state on resize.
  // ---------------------------------------------------------------------------
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  let W = 0, H = 0, DPR = 1, S = 1; // S = pixels per world unit

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 3);
    W = Math.max(1, window.innerWidth);
    H = Math.max(1, window.innerHeight);
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    // World is ~560 units wide and ~760 units tall at minimum.
    S = Math.min(W / 560, H / 760);
    if (!running) render();
  }
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(document.documentElement);

  // ---------------------------------------------------------------------------
  // Game state
  // ---------------------------------------------------------------------------
  const BH = 34;          // block height (world units)
  const BASE_W = 220;     // starting block width
  const PERFECT_TOL = 5;  // world units of forgiveness for a perfect drop
  const DEPTH = 22;       // pseudo-3D depth

  let state = 'loading';  // loading | menu | playing | over
  let paused = false;
  let running = false;
  let blocks = [];
  let current = null;
  let debris = [];
  let particles = [];
  let popups = [];
  let waves = [];
  let stars = [];
  let combo = 0;
  let maxCombo = 0;
  let score = 0;
  let camY = 0;
  let camTarget = 0;
  let baseHue = 200;
  let overTime = 0;
  let newBest = false;
  let shake = 0;
  let time = 0;
  // Ads / run bookkeeping
  let adBusy = false;          // an ad request is in flight; game is frozen
  let revivedThisRun = false;  // only one rewarded continue per run
  let runCounted = false;      // this run already counted in save.games
  let runLayersCounted = 0;    // layers of this run already added to totalLayers
  let gamesSinceAd = 0;
  const INTERSTITIAL_EVERY = 3;
  let buttons = [];            // hit areas of on-screen buttons (CSS px)

  function makeStars() {
    stars = [];
    for (let i = 0; i < 90; i++) {
      stars.push({ x: Math.random(), y: Math.random(), r: Math.random() * 1.4 + 0.3, tw: Math.random() * 6.28 });
    }
  }

  function hueAt(i) { return (baseHue + i * 6) % 360; }

  function resetTower() {
    baseHue = Math.floor(Math.random() * 360);
    blocks = [{ x: 0, w: BASE_W, i: 0 }];
    debris = [];
    particles = [];
    popups = [];
    waves = [];
    combo = 0;
    maxCombo = 0;
    score = 0;
    camY = camTarget = 0;
    current = null;
  }

  function spawnBlock() {
    const top = blocks[blocks.length - 1];
    const i = top.i + 1;
    const range = Math.min(250, Math.max(140, 280 - top.w / 2));
    const dir = i % 2 === 0 ? 1 : -1;
    current = {
      x: -dir * range,
      w: top.w,
      i,
      dir,
      range,
      speed: Math.min(170 + i * 5.5, 460),
    };
  }

  function startGame() {
    resetTower();
    revivedThisRun = false;
    runCounted = false;
    runLayersCounted = 0;
    state = 'playing';
    spawnBlock();
    sfx.start();
  }

  // "Play again" from the game over screen: a natural break for an interstitial.
  async function playAgain() {
    gamesSinceAd++;
    if (gamesSinceAd >= INTERSTITIAL_EVERY) {
      gamesSinceAd = 0;
      await withAd(() => SDK.interstitial());
    }
    startGame();
  }

  // Rewarded continue: user-initiated, once per run.
  async function continueWithAd() {
    if (!canContinue()) return;
    const earned = await withAd(() => SDK.rewarded('sky-stack-continue'));
    if (!earned) return;
    revivedThisRun = true;
    state = 'playing';
    newBest = false;
    // Give the player a fair second chance: widen a thin top block.
    const top = blocks[blocks.length - 1];
    top.w = Math.max(top.w, BASE_W * 0.6);
    waves.push({ x: top.x, w: top.w, i: top.i, t: 0 });
    spawnBlock();
    sfx.start();
  }

  function canContinue() {
    return state === 'over' && !revivedThisRun && score >= 3 && !adBusy;
  }

  // Freeze game input and sound while an ad is shown.
  async function withAd(fn) {
    adBusy = true;
    updateAudioState();
    try { return await fn(); } finally {
      adBusy = false;
      updateAudioState();
      last = performance.now();
    }
  }

  function drop() {
    if (!current) return;
    const top = blocks[blocks.length - 1];
    const dx = current.x - top.x;
    const adx = Math.abs(dx);

    if (adx <= PERFECT_TOL) {
      // Perfect placement: snap, build combo, grow after a streak.
      combo++;
      maxCombo = Math.max(maxCombo, combo);
      let w = top.w;
      if (combo >= 3) w = Math.min(BASE_W, w + 6);
      blocks.push({ x: top.x, w, i: current.i });
      waves.push({ x: top.x, w, i: current.i, t: 0 });
      popups.push({ text: combo > 1 ? `${L.perfect} ×${combo}` : L.perfect, i: current.i, t: 0 });
      sfx.perfect(combo);
      burst(top.x, current.i, w, 18, hueAt(current.i));
    } else if (adx >= top.w) {
      // Missed entirely.
      debris.push(makeDebris(current.x, current.w, current.i, dx > 0 ? 1 : -1));
      current = null;
      gameOver();
      return;
    } else {
      combo = 0;
      const newW = top.w - adx;
      const newX = top.x + dx / 2;
      const cutW = adx;
      const side = dx > 0 ? 1 : -1;
      const cutX = newX + side * (newW / 2 + cutW / 2);
      blocks.push({ x: newX, w: newW, i: current.i });
      debris.push(makeDebris(cutX, cutW, current.i, side));
      sfx.cut();
      sfx.place(current.i);
      shake = Math.min(6, 2 + cutW / 20);
    }

    score = blocks.length - 1;
    camTarget = Math.max(0, (blocks.length - 6) * BH);
    spawnBlock();
  }

  function makeDebris(x, w, i, side) {
    return {
      x, w, y: i * BH, vx: side * (40 + Math.random() * 60), vy: 60,
      rot: 0, vr: side * (1.2 + Math.random() * 1.6), hue: hueAt(i), life: 0,
    };
  }

  function burst(x, i, w, n, hue) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 60 + Math.random() * 160;
      particles.push({
        x: x + (Math.random() - 0.5) * w, y: (i + 1) * BH,
        vx: Math.cos(a) * sp, vy: Math.abs(Math.sin(a)) * sp + 40,
        life: 0, max: 0.6 + Math.random() * 0.5, hue,
      });
    }
  }

  function gameOver() {
    state = 'over';
    overTime = 0;
    sfx.over();
    shake = 8;
    newBest = score > save.best;
    if (!runCounted) { save.games++; runCounted = true; }
    save.totalLayers += score - runLayersCounted;
    runLayersCounted = score;
    save.bestCombo = Math.max(save.bestCombo, maxCombo);
    if (newBest) save.best = score;
    saveDirty = true;
    persist().then(() => { if (newBest) SDK.sendScore(save.best); });
  }

  // ---------------------------------------------------------------------------
  // Input: touch, mouse and keyboard
  // ---------------------------------------------------------------------------
  function onAction(px, py) {
    if (paused || adBusy) return;
    ensureAudio();
    if (state === 'menu') startGame();
    else if (state === 'playing') drop();
    else if (state === 'over' && overTime > 0.7) {
      if (px !== undefined) {
        const hit = buttons.find((b) => px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h);
        if (hit && hit.id === 'continue') { continueWithAd(); return; }
      }
      playAgain();
    }
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== undefined && e.button > 0) return;
    e.preventDefault();
    canvas.focus({ preventScroll: true });
    const r = canvas.getBoundingClientRect();
    onAction(e.clientX - r.left, e.clientY - r.top);
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Never preventDefault on Escape; it just returns to the title screen.
      if (state === 'over' && !paused) state = 'menu';
      return;
    }
    if (e.repeat) return;
    if ((e.key === 'c' || e.key === 'C') && canContinue() && overTime > 0.7 && !paused) {
      continueWithAd();
      return;
    }
    if (e.code === 'Space' || e.key === 'Enter' || e.key === 'ArrowDown') {
      e.preventDefault();
      onAction();
    }
  });

  // ---------------------------------------------------------------------------
  // Pause / resume (only via the SDK callbacks)
  // ---------------------------------------------------------------------------
  SDK.onPause(() => {
    paused = true;
    updateAudioState();
    persist();
  });
  SDK.onResume(() => {
    paused = false;
    updateAudioState();
    if (state !== 'loading') startLoop();
  });
  SDK.onAudioEnabledChange((enabled) => {
    audioEnabled = !!enabled;
    updateAudioState();
  });

  // ---------------------------------------------------------------------------
  // Loop
  // ---------------------------------------------------------------------------
  let last = 0;
  let rafId = 0;

  function startLoop() {
    if (running || paused) return;
    running = true;
    last = performance.now();
    rafId = requestAnimationFrame(frame);
  }

  function frame(now) {
    if (paused) { running = false; return; }
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    music.tick();
    render();
    rafId = requestAnimationFrame(frame);
  }

  function update(dt) {
    if (adBusy) return;
    time += dt;
    if (state === 'over') overTime += dt;

    if (current && state === 'playing') {
      current.x += current.dir * current.speed * dt;
      if (current.x > current.range) { current.x = current.range; current.dir = -1; }
      if (current.x < -current.range) { current.x = -current.range; current.dir = 1; }
    }

    camY += (camTarget - camY) * Math.min(1, dt * 6);
    shake = Math.max(0, shake - dt * 30);

    for (const d of debris) {
      d.vy -= 900 * dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.rot += d.vr * dt;
      d.life += dt;
    }
    debris = debris.filter((d) => d.life < 3);

    for (const p of particles) {
      p.vy -= 400 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life += dt;
    }
    particles = particles.filter((p) => p.life < p.max);

    for (const p of popups) p.t += dt;
    popups = popups.filter((p) => p.t < 1);
    for (const w of waves) w.t += dt;
    waves = waves.filter((w) => w.t < 0.5);
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------
  const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  function toScreenX(x) { return W / 2 + x * S; }
  function groundY() { return H * 0.82; }
  function toScreenY(y) { return groundY() - (y - camY) * S; }

  function drawBlock(x, w, i, alpha = 1, yOverride) {
    const hue = hueAt(i);
    const y = yOverride !== undefined ? yOverride : i * BH;
    const left = toScreenX(x - w / 2);
    const right = toScreenX(x + w / 2);
    const top = toScreenY(y + BH);
    const bottom = toScreenY(y);
    const d = DEPTH * S;
    const dy = d * 0.55;

    ctx.globalAlpha = alpha;
    // Right side
    ctx.fillStyle = `hsl(${hue},55%,34%)`;
    ctx.beginPath();
    ctx.moveTo(right, top);
    ctx.lineTo(right + d, top - dy);
    ctx.lineTo(right + d, bottom - dy);
    ctx.lineTo(right, bottom);
    ctx.closePath();
    ctx.fill();
    // Top
    ctx.fillStyle = `hsl(${hue},80%,72%)`;
    ctx.beginPath();
    ctx.moveTo(left, top);
    ctx.lineTo(left + d, top - dy);
    ctx.lineTo(right + d, top - dy);
    ctx.lineTo(right, top);
    ctx.closePath();
    ctx.fill();
    // Front
    const g = ctx.createLinearGradient(0, top, 0, bottom);
    g.addColorStop(0, `hsl(${hue},70%,58%)`);
    g.addColorStop(1, `hsl(${hue},65%,47%)`);
    ctx.fillStyle = g;
    ctx.fillRect(left, top, right - left, bottom - top);
    ctx.globalAlpha = 1;
  }

  function drawBackground() {
    const t = Math.min(1, camY / (BH * 70));
    const h = (baseHue + 180) % 360;
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, `hsl(${(h + 30) % 360},${50 - t * 15}%,${34 - t * 26}%)`);
    g.addColorStop(1, `hsl(${h},${55 - t * 20}%,${62 - t * 46}%)`);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Stars fade in as the tower climbs.
    const sa = 0.15 + t * 0.85;
    ctx.fillStyle = '#fff';
    for (const s of stars) {
      const yy = ((s.y * H + camY * S * 0.08) % H + H) % H;
      ctx.globalAlpha = sa * (0.5 + 0.5 * Math.sin(time * 2 + s.tw));
      ctx.beginPath();
      ctx.arc(s.x * W, yy, s.r * Math.max(1, S), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Ground / pedestal
    const gy = toScreenY(0);
    if (gy < H) {
      ctx.fillStyle = `hsla(${h},40%,12%,0.55)`;
      ctx.fillRect(0, gy, W, H - gy);
    }
  }

  function text(str, x, y, size, color = '#fff', weight = 800, align = 'center', alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.font = `${weight} ${Math.round(size)}px ${FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillText(str, x, y + size * 0.06);
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
    ctx.globalAlpha = 1;
  }

  function fitSize(str, size, maxW, weight = 800) {
    ctx.font = `${weight} ${Math.round(size)}px ${FONT}`;
    const w = ctx.measureText(str).width;
    return w > maxW ? size * (maxW / w) : size;
  }

  function render() {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    drawBackground();

    const sx = shake ? (Math.random() - 0.5) * shake * S : 0;
    const sy = shake ? (Math.random() - 0.5) * shake * S : 0;
    ctx.save();
    ctx.translate(sx, sy);

    if (state === 'loading') {
      ctx.restore();
      text(L.loading, W / 2, H / 2, 24 * Math.max(1, S), 'rgba(255,255,255,0.85)', 600);
      return;
    }

    // Pedestal under the tower
    const b0 = blocks[0];
    const pedTop = toScreenY(0);
    if (pedTop < H) {
      const left = toScreenX(b0.x - b0.w / 2);
      const right = toScreenX(b0.x + b0.w / 2);
      const d = DEPTH * S;
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.fillRect(left, pedTop, right - left + d, H - pedTop);
    }

    // Only draw blocks that are on screen.
    for (const b of blocks) {
      const sy0 = toScreenY(b.i * BH);
      if (sy0 < -BH * S * 2 || toScreenY((b.i + 1) * BH) > H + BH * S) continue;
      drawBlock(b.x, b.w, b.i);
    }

    // Perfect-drop glow waves
    for (const w of waves) {
      const k = w.t / 0.5;
      const pad = (6 + k * 26) * S;
      const left = toScreenX(w.x - w.w / 2) - pad;
      const right = toScreenX(w.x + w.w / 2) + pad;
      const top = toScreenY((w.i + 1) * BH) - pad;
      const bottom = toScreenY(w.i * BH) + pad;
      ctx.strokeStyle = `rgba(255,255,255,${0.8 * (1 - k)})`;
      ctx.lineWidth = Math.max(1, 3 * S);
      ctx.strokeRect(left, top, right - left, bottom - top);
    }

    if (current) drawBlock(current.x, current.w, current.i);

    for (const d of debris) {
      const cx = toScreenX(d.x);
      const cy = toScreenY(d.y + BH / 2);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(d.rot);
      ctx.translate(-cx, -cy);
      ctx.globalAlpha = Math.max(0, 1 - d.life / 3);
      ctx.fillStyle = `hsl(${d.hue},65%,52%)`;
      ctx.fillRect(toScreenX(d.x - d.w / 2), toScreenY(d.y + BH), d.w * S, BH * S);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    for (const p of particles) {
      const a = 1 - p.life / p.max;
      ctx.globalAlpha = a;
      ctx.fillStyle = `hsl(${p.hue},90%,80%)`;
      const r = (2 + 3 * a) * S;
      ctx.fillRect(toScreenX(p.x) - r / 2, toScreenY(p.y) - r / 2, r, r);
    }
    ctx.globalAlpha = 1;

    for (const p of popups) {
      const y = toScreenY((p.i + 1) * BH) - (30 + p.t * 50) * S;
      const size = fitSize(p.text, 26 * S, W * 0.8);
      text(p.text, W / 2, y, size, '#fff', 900, 'center', 1 - p.t);
    }

    ctx.restore();
    drawUI();
  }

  function drawUI() {
    const u = Math.min(Math.max(0.75, S), H / 420);
    const pad = 16;

    if (state === 'playing' || state === 'over') {
      text(String(score), W / 2, Math.max(56, H * 0.12), 72 * u, '#fff', 900);
    }

    if (state === 'playing' && score === 0) {
      const hs = fitSize(L.hint, 16 * u, W - pad * 2, 600);
      text(L.hint, W / 2, H * 0.92, hs, 'rgba(255,255,255,0.85)', 600);
    }

    if (state === 'menu') {
      const ts = fitSize(L.title, 64 * u, W - pad * 2, 900);
      const bob = Math.sin(time * 2) * 4 * u;
      text(L.title, W / 2, H * 0.24 + bob, ts, '#fff', 900);
      if (save.best > 0) {
        text(`${L.best}: ${save.best}`, W / 2, H * 0.24 + ts * 0.9, 20 * u, 'rgba(255,255,255,0.85)', 700);
      }
      const a = 0.55 + 0.45 * Math.sin(time * 4);
      const tps = fitSize(L.tap, 24 * u, W - pad * 2, 700);
      text(L.tap, W / 2, H * 0.92, tps, '#fff', 700, 'center', a);
    }

    if (state === 'over') {
      const k = Math.min(1, overTime / 0.35);
      const pw = Math.min(W - pad * 2, 360 * u);
      const ph = 230 * u;
      const px = (W - pw) / 2;
      const bh = Math.max(44, 52 * u);
      const groupH = ph + 16 * u + 2 * bh + 12 * u;
      const py = Math.max(pad, (H - groupH) / 2 + 30 * u) + (1 - k) * 40;
      ctx.globalAlpha = 0.85 * k;
      ctx.fillStyle = 'rgba(10,14,40,0.82)';
      roundRect(px, py, pw, ph, 20 * u);
      ctx.fill();
      ctx.globalAlpha = 1;

      const os = fitSize(L.over, 34 * u, pw - 32, 900);
      text(L.over, W / 2, py + 44 * u, os, '#fff', 900, 'center', k);
      text(`${L.score}`, W / 2 - pw / 4, py + 100 * u, 15 * u, 'rgba(255,255,255,0.7)', 700, 'center', k);
      text(`${L.best}`, W / 2 + pw / 4, py + 100 * u, 15 * u, 'rgba(255,255,255,0.7)', 700, 'center', k);
      text(String(score), W / 2 - pw / 4, py + 136 * u, 40 * u, '#fff', 900, 'center', k);
      text(String(save.best), W / 2 + pw / 4, py + 136 * u, 40 * u, '#ffd166', 900, 'center', k);
      if (newBest) {
        const pulse = 1 + 0.06 * Math.sin(time * 8);
        const ns = fitSize(L.newBest, 22 * u * pulse, pw - 32, 900);
        text(L.newBest, W / 2, py + 188 * u, ns, '#ffd166', 900, 'center', k);
      }
      buttons = [];
      if (overTime > 0.7) {
        const bw = pw;
        let by = py + ph + 16 * u;
        if (canContinue()) {
          drawButton('continue', '▶ ' + L.cont, px, by, bw, bh, '#ffd166', '#1b1f3a', u);
          by += bh + 12 * u;
        }
        drawButton('again', L.again, px, by, bw, bh, 'rgba(255,255,255,0.16)', '#fff', u);
      }
    }
  }

  function drawButton(id, label, x, y, w, h, bg, fg, u) {
    buttons.push({ id, x, y, w, h });
    ctx.fillStyle = bg;
    roundRect(x, y, w, h, h / 2);
    ctx.fill();
    const fs = fitSize(label, 20 * u, w - 32, 800);
    ctx.font = `800 ${Math.round(fs)}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = fg;
    ctx.fillText(label, x + w / 2, y + h / 2);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // ---------------------------------------------------------------------------
  // Boot: first frame -> load save + language -> menu -> gameReady
  // ---------------------------------------------------------------------------
  async function boot() {
    makeStars();
    resetTower();
    resize();
    render();
    SDK.firstFrameReady();

    const [data, lang] = await Promise.all([SDK.loadData(), SDK.getLanguage()]);
    parseSave(data);
    saveLoaded = true;
    setLanguage(lang);

    state = 'menu';
    render();
    startLoop();
    SDK.gameReady();
    if (save.best > 0) SDK.sendScore(save.best);
  }

  boot();
})();
