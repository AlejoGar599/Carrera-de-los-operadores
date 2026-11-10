/* ==========================================================
   Audio generado con Web Audio (sin archivos de sonido)
   Los efectos del Jugador 1 suenan a la izquierda y los del
   Jugador 2 a la derecha.
   ========================================================== */
(function () {
  'use strict';
  const OP = window.OP;

  let ctx = null;
  let master = null;
  let sfxBus = null;
  let musicBus = null;
  let noiseBuf = null;

  let musicWanted = true;
  let musicPlaying = false;
  let urgent = false;
  let timer = null;
  let nextTime = 0;
  let step = 0;
  const BPM = 140;

  function unlock() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        ctx = new AC();
      } catch (e) {
        ctx = null;
        return;
      }
      master = ctx.createGain();
      master.gain.value = 0.8;
      const comp = ctx.createDynamicsCompressor();
      master.connect(comp);
      comp.connect(ctx.destination);
      sfxBus = ctx.createGain();
      sfxBus.gain.value = 0.9;
      sfxBus.connect(master);
      musicBus = ctx.createGain();
      musicBus.gain.value = 0;
      musicBus.connect(master);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function route(node, pan, bus) {
    const out = bus || sfxBus;
    if (pan && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = pan;
      node.connect(p);
      p.connect(out);
    } else {
      node.connect(out);
    }
  }

  function tone(o) {
    if (!ctx) return;
    const t0 = o.at != null ? o.at : ctx.currentTime + (o.delay || 0);
    const dur = o.dur || 0.15;
    const osc = ctx.createOscillator();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.freq, t0);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.to), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.1, t0 + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    route(g, o.pan, o.bus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  function noise(o) {
    if (!ctx) return;
    const t0 = o.at != null ? o.at : ctx.currentTime + (o.delay || 0);
    const dur = o.dur || 0.2;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = o.filter || 'bandpass';
    f.frequency.setValueAtTime(o.freq || 1000, t0);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t0 + dur);
    f.Q.value = o.q || 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(o.vol || 0.15, t0 + (o.attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    route(g, o.pan, o.bus);
    src.start(t0, Math.random() * 0.5);
    src.stop(t0 + dur + 0.05);
  }

  const PAN = (p) => (p === 0 ? -0.6 : p === 1 ? 0.6 : 0);

  const sfx = {
    correct(p) {
      const k = p === 1 ? 1.122 : 1;
      tone({ freq: 660 * k, dur: 0.08, vol: 0.07, pan: PAN(p) });
      tone({ freq: 990 * k, dur: 0.13, vol: 0.07, delay: 0.055, pan: PAN(p) });
    },
    wrong(p) {
      tone({ freq: 220, to: 55, dur: 0.38, type: 'sawtooth', vol: 0.12, pan: PAN(p) });
      noise({ dur: 0.3, freq: 900, q: 0.6, vol: 0.12, pan: PAN(p) });
    },
    dash(p) {
      noise({ dur: 0.42, filter: 'highpass', freq: 400, to: 5000, vol: 0.14, pan: PAN(p) });
      tone({ freq: 160, to: 560, dur: 0.24, type: 'triangle', vol: 0.12, pan: PAN(p) });
    },
    shot(p) {
      tone({ freq: 1500, to: 240, dur: 0.14, vol: 0.08, pan: PAN(p) });
    },
    hit(p) {
      noise({ dur: 0.12, filter: 'lowpass', freq: 1800, vol: 0.2, pan: PAN(p) });
      tone({ freq: 170, to: 80, dur: 0.12, type: 'sine', vol: 0.18, pan: PAN(p) });
    },
    destroy(p) {
      noise({ dur: 0.55, filter: 'lowpass', freq: 2600, to: 120, vol: 0.26, pan: PAN(p) });
      tone({ freq: 120, to: 35, dur: 0.5, type: 'sine', vol: 0.28, pan: PAN(p) });
    },
    crash(p) {
      noise({ dur: 0.6, filter: 'lowpass', freq: 1000, to: 80, vol: 0.3, pan: PAN(p) });
      tone({ freq: 95, to: 30, dur: 0.6, type: 'sawtooth', vol: 0.14, pan: PAN(p) });
    },
    mode(p, m) {
      const a = m === 'shoot' ? 520 : 392;
      tone({ freq: a, dur: 0.06, type: 'triangle', vol: 0.1, pan: PAN(p) });
      tone({ freq: a * 1.5, dur: 0.08, type: 'triangle', vol: 0.08, delay: 0.05, pan: PAN(p) });
    },
    alarm(p) {
      tone({ freq: 880, dur: 0.07, vol: 0.05, pan: PAN(p) });
      tone({ freq: 880, dur: 0.07, vol: 0.05, delay: 0.13, pan: PAN(p) });
    },
    levelUp(p) {
      [523, 659, 784, 1047].forEach((f, i) => tone({ freq: f, dur: 0.1, vol: 0.06, delay: i * 0.06, pan: PAN(p) }));
    },
    tick() {
      tone({ freq: 523, dur: 0.16, vol: 0.12 });
    },
    go() {
      tone({ freq: 1046, dur: 0.42, vol: 0.12 });
      tone({ freq: 1568, dur: 0.42, vol: 0.05 });
    },
    end() {
      [1046, 784, 659, 523].forEach((f, i) => tone({ freq: f, dur: 0.18, vol: 0.1, delay: i * 0.1 }));
    },
    win() {
      [523, 659, 784, 1046, 784, 1046].forEach((f, i) => tone({ freq: f, dur: 0.16, vol: 0.08, delay: i * 0.09 }));
    },
    click() {
      tone({ freq: 720, dur: 0.04, type: 'triangle', vol: 0.06 });
    },
  };

  /* ---------- Música: secuenciador simple estilo chiptune ---------- */
  const midi = (m) => 440 * Math.pow(2, (m - 69) / 12);
  // La menor: Am – F – C – G
  const CHORDS = [
    { root: 45, tones: [0, 3, 7] },
    { root: 41, tones: [0, 4, 7] },
    { root: 48, tones: [0, 4, 7] },
    { root: 43, tones: [0, 4, 7] },
  ];
  const ARP = [0, 1, 2, 3, 2, 1, 0, 1, 0, 1, 2, 3, 2, 3, 2, 1];

  function playStep(i, t) {
    const bar = Math.floor(i / 16) % 4;
    const s = i % 16;
    const ch = CHORDS[bar];
    const bus = musicBus;
    // bombo
    if (s % 4 === 0) tone({ at: t, freq: 150, to: 42, dur: 0.14, type: 'sine', vol: 0.5, bus });
    // palmas
    if (s === 4 || s === 12) noise({ at: t, dur: 0.09, freq: 1900, q: 1.2, vol: 0.16, bus });
    // platillo
    if (s % 4 === 2 || (urgent && s % 2 === 1)) noise({ at: t, dur: 0.03, filter: 'highpass', freq: 7000, vol: 0.07, bus });
    // bajo
    if (s % 2 === 0) {
      const n = ch.root + (s % 4 === 2 ? 12 : 0);
      tone({ at: t, freq: midi(n), dur: 0.1, type: 'square', vol: 0.07, bus });
    }
    // arpegio
    const idx = ARP[s];
    const semi = idx === 3 ? ch.tones[0] + 12 : ch.tones[idx];
    tone({ at: t, freq: midi(ch.root + 24 + semi + (urgent ? 12 : 0)), dur: 0.07, type: 'square', vol: 0.028, bus });
  }

  function schedule() {
    if (!ctx || !musicPlaying) return;
    const spb = 60 / BPM / 4;
    while (nextTime < ctx.currentTime + 0.12) {
      playStep(step, nextTime);
      nextTime += spb;
      step = (step + 1) % 64;
    }
  }

  function startMusic() {
    if (!ctx || !musicWanted || musicPlaying) return;
    musicPlaying = true;
    step = 0;
    nextTime = ctx.currentTime + 0.06;
    musicBus.gain.cancelScheduledValues(ctx.currentTime);
    musicBus.gain.setTargetAtTime(0.55, ctx.currentTime, 0.2);
    timer = setInterval(schedule, 25);
  }

  function stopMusic() {
    if (!musicPlaying) return;
    musicPlaying = false;
    clearInterval(timer);
    timer = null;
    if (ctx) musicBus.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
  }

  OP.Audio = {
    unlock,
    sfx: new Proxy(sfx, {
      get(target, name) {
        const fn = target[name];
        return function () {
          if (!ctx || typeof fn !== 'function') return;
          try {
            fn.apply(null, arguments);
          } catch (e) {
            /* el audio nunca debe romper el juego */
          }
        };
      },
    }),
    startMusic,
    stopMusic,
    setMusicEnabled(on) {
      musicWanted = !!on;
      if (!musicWanted) stopMusic();
    },
    isMusicEnabled: () => musicWanted,
    isMusicPlaying: () => musicPlaying,
    setUrgent(on) {
      urgent = !!on;
    },
    setPaused(on) {
      if (!ctx) return;
      if (on) ctx.suspend();
      else ctx.resume();
    },
  };
})();
