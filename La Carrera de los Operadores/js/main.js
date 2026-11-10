/* ==========================================================
   Juego principal: estados, bucle, entrada y pantallas
   menu → countdown → race → finish → results
   ========================================================== */
(function () {
  'use strict';
  const OP = window.OP;
  const C = OP.CONFIG;
  const U = OP.U;
  const A = OP.Audio;
  const COL = OP.COLORS;
  const $ = (s) => document.querySelector(s);

  const G = {
    phase: 'menu',
    paused: false,
    race: null,
    renderer: null,
    cockpits: [],
    problems: [null, null],
    lastSig: [null, null],
    pending: [0, 0], // >0: segundos para la siguiente operación · -1: esperar fin de la avería
    lastTier: [0, 0],
    countdown: 0,
    lastBeep: 0,
    goT: 0,
    finishT: 0,
    botLevel: 2,
    last: 0,
    blockUntil: 0,
  };

  // ---------- Teclado ----------
  const KEYMAP = new Map();
  OP.CONTROLS.forEach((ctrl, p) => {
    ctrl.options.forEach((codes, slot) => codes.forEach((c) => KEYMAP.set(c, { p, slot })));
    Object.keys(ctrl.modes).forEach((m) => ctrl.modes[m].forEach((c) => KEYMAP.set(c, { p, mode: m })));
  });
  const BLOCKED = new Set(Array.from(KEYMAP.keys()).concat(['Space', 'Escape', 'Tab']));

  function onKeyDown(e) {
    const code = e.code;
    if (BLOCKED.has(code)) e.preventDefault();
    if (e.repeat) return;
    A.unlock();

    if (code === 'Escape') {
      if (G.phase === 'race' || G.phase === 'countdown') setPaused(!G.paused);
      else if (G.phase === 'results') goMenu();
      return;
    }
    if (code === 'KeyM') {
      toggleMusic();
      return;
    }
    const startKey = code === 'Enter' || code === 'NumpadEnter' || code === 'Space';
    if (G.phase === 'menu') {
      if (startKey) startGame();
      return;
    }
    if (G.phase === 'results') {
      if (startKey && performance.now() > G.blockUntil) startGame();
      return;
    }
    if (G.paused) return;
    const k = KEYMAP.get(code);
    if (!k) return;
    if (k.mode) handleMode(k.p, k.mode);
    else handleOption(k.p, k.slot);
  }

  // ---------- Partida ----------
  function newRace(demo) {
    G.race = new OP.Race({
      seed: (Math.random() * 1e9) | 0,
      botLevel: demo ? 2 : G.botLevel,
      demo,
      onEvent,
    });
    if (demo) G.race.start();
    G.renderer.reset();
    G.problems = [null, null];
    G.lastSig = [null, null];
    G.pending = [0, 0];
    G.lastTier = [0, 0];
    G.goT = 0;
    G.cockpits.forEach((c) => {
      c.reset();
      c.setMode('accel');
    });
  }

  function startGame() {
    A.unlock();
    A.sfx.click();
    hideOverlays();
    newRace(false);
    G.phase = 'countdown';
    G.paused = false;
    G.countdown = C.COUNTDOWN;
    G.lastBeep = C.COUNTDOWN + 1;
    G.cockpits.forEach((c, i) => {
      const ctrl = OP.CONTROLS[i];
      c.showStandby(
        'PREPÁRATE',
        'Elige tu modo: <b>' + ctrl.modeLabels.accel + '</b> acelerar · <b>' + ctrl.modeLabels.shoot + '</b> disparar'
      );
    });
    A.setUrgent(false);
    A.stopMusic();
    A.startMusic();
  }

  function goMenu() {
    G.phase = 'menu';
    G.paused = false;
    A.stopMusic();
    A.setPaused(false);
    hideOverlays();
    $('#menu').classList.remove('hidden');
    newRace(true);
    showMenuStandby();
  }

  function showMenuStandby() {
    G.cockpits.forEach((c, i) => {
      const ctrl = OP.CONTROLS[i];
      c.showStandby(
        'EN ESPERA',
        'Responde con <b>' + ctrl.optionLabels.join(' ') + '</b> · modos <b>' + ctrl.modeLabels.accel + '</b> / <b>' + ctrl.modeLabels.shoot + '</b>'
      );
    });
  }

  function finishRace() {
    G.phase = 'finish';
    G.finishT = 1.9;
    G.race.finish();
    A.setUrgent(false);
    A.sfx.end();
    G.cockpits.forEach((c) => {
      c.setLock(0, 1, null);
      c.setWarning(null);
      c.showStandby('¡TIEMPO!', '');
    });
  }

  function nextProblem(p) {
    const ship = G.race.humans[p];
    const prob = OP.Problems.create(ship.stats.correct, Math.random, G.lastSig[p]);
    G.lastSig[p] = prob.sig;
    G.problems[p] = prob;
    G.pending[p] = 0;
    const cp = G.cockpits[p];
    cp.setProblem(prob);
    cp.setLevel(prob.tier);
    if (prob.tier > G.lastTier[p]) {
      G.lastTier[p] = prob.tier;
      cp.fx('NIVEL ' + (prob.tier + 1), 'lvl');
      A.sfx.levelUp(p);
    }
  }

  function handleOption(p, slot) {
    if (G.paused || G.phase !== 'race') return;
    const prob = G.problems[p];
    const ship = G.race.humans[p];
    if (!prob || G.pending[p] !== 0 || ship.lock > 0) return;
    const cp = G.cockpits[p];
    cp.press(slot);
    const correct = slot === prob.correct;
    const res = G.race.answer(ship.index, correct);
    if (!res) return;
    cp.feedback(correct, slot, prob, res.effect, ship.stats.streak);
    G.problems[p] = null;
    G.pending[p] = correct ? C.NEXT_PROBLEM_DELAY : -1;
    if (correct) A.sfx.correct(p);
  }

  function handleMode(p, mode) {
    if (G.paused || !(G.phase === 'race' || G.phase === 'countdown')) return;
    const ship = G.race.humans[p];
    if (ship.mode === mode) return;
    G.race.setMode(ship.index, mode);
    G.cockpits[p].setMode(mode);
    A.sfx.mode(p, mode);
  }

  function onEvent(type, ship) {
    G.renderer.onEvent(type, ship);
    if (ship.kind !== 'human' || G.phase !== 'race') return;
    const p = ship.player;
    const cp = G.cockpits[p];
    switch (type) {
      case 'dash':
        A.sfx.dash(p);
        break;
      case 'shot':
      case 'noTarget':
        A.sfx.shot(p);
        break;
      case 'hit':
        A.sfx.hit(p);
        break;
      case 'destroy':
        A.sfx.destroy(p);
        cp.fx('ASTEROIDE DESTRUIDO', 'ok');
        break;
      case 'stall':
      case 'jam':
        A.sfx.wrong(p);
        break;
      case 'crash':
        A.sfx.crash(p);
        cp.crash();
        break;
      case 'incoming':
        A.sfx.alarm(p);
        break;
    }
  }

  // ---------- Bucle ----------
  function loop(now) {
    const dt = G.last ? Math.min(0.05, (now - G.last) / 1000) : 0;
    G.last = now;
    if (!G.paused) step(dt);
    draw(G.paused ? 0 : dt);
    requestAnimationFrame(loop);
  }

  function step(dt) {
    const r = G.race;
    if (G.phase === 'countdown') {
      G.countdown -= dt;
      const n = Math.ceil(G.countdown);
      if (n < G.lastBeep && n > 0) {
        A.sfx.tick();
        G.lastBeep = n;
      }
      if (G.countdown <= 0) {
        G.phase = 'race';
        r.start();
        A.sfx.go();
        G.goT = 0.9;
        nextProblem(0);
        nextProblem(1);
      }
    }
    if (G.goT > 0) G.goT = Math.max(0, G.goT - dt);

    r.update(dt);

    if (G.phase === 'menu' && r.time >= C.RACE_TIME) newRace(true);

    if (G.phase === 'race') {
      for (let p = 0; p < 2; p++) {
        const ship = r.humans[p];
        if (G.pending[p] > 0) {
          G.pending[p] -= dt;
          if (G.pending[p] <= 0) nextProblem(p);
        } else if (G.pending[p] < 0 && ship.lock <= 0) {
          nextProblem(p);
        }
        G.cockpits[p].setLock(ship.lock, ship.lockTotal, ship.lockReason);
        G.cockpits[p].setWarning(r.threatFor(ship));
      }
      const left = C.RACE_TIME - r.time;
      A.setUrgent(left <= 10);
      if (left <= 0) finishRace();
    } else if (G.phase === 'finish') {
      G.finishT -= dt;
      if (G.finishT <= 0) showResults();
    }

    for (let p = 0; p < 2; p++) {
      const ship = r.humans[p];
      G.cockpits[p].updateWindshield(dt, (ship.speed + ship.boost) / C.BASE_SPEED, ship.stall > 0);
    }
  }

  function draw(dt) {
    const r = G.race;
    G.renderer.draw(
      r,
      {
        phase: G.phase,
        countdown: G.countdown,
        goT: G.goT,
        timeLeft: G.phase === 'menu' ? C.RACE_TIME : Math.max(0, C.RACE_TIME - r.time),
      },
      dt
    );
  }

  // ---------- Pantallas ----------
  function hideOverlays() {
    ['#menu', '#pause', '#results'].forEach((s) => $(s).classList.add('hidden'));
  }

  function setPaused(on) {
    if (G.paused === on) return;
    G.paused = on;
    $('#pause').classList.toggle('hidden', !on);
    A.setPaused(on);
  }

  function toggleMusic() {
    const on = !A.isMusicEnabled();
    A.setMusicEnabled(on);
    if (on && (G.phase === 'race' || G.phase === 'countdown')) A.startMusic();
    syncMusicUI();
  }

  function syncMusicUI() {
    const on = A.isMusicEnabled();
    document.querySelectorAll('#seg-music button').forEach((b) => b.classList.toggle('on', (b.dataset.v === '1') === on));
    $('#btn-sound').classList.toggle('off', !on);
  }

  const fmtM = (x) => Math.round(x).toLocaleString('es-CO') + ' m';

  function showResults() {
    G.phase = 'results';
    G.blockUntil = performance.now() + 900;
    A.stopMusic();
    const r = G.race;
    const order = r.finalOrder;
    const lead = order[0];
    const tie = order.length > 1 && Math.abs(order[0].x - order[1].x) < 1;
    let title;
    let color;
    if (tie) {
      title = '¡EMPATE!';
      color = COL.ink;
    } else if (lead.ship.kind === 'human') {
      title = '¡GANA EL ' + lead.ship.name.toUpperCase() + '!';
      color = lead.ship.color;
      A.sfx.win();
    } else {
      title = '¡GANA ' + lead.ship.name + '!';
      color = COL.bot;
    }

    const h0 = r.finalOrder.find((o) => o.ship.player === 0);
    const h1 = r.finalOrder.find((o) => o.ship.player === 1);
    const diff = Math.round(Math.abs(h0.x - h1.x));
    const ahead = h0.x >= h1.x ? h0.ship : h1.ship;
    let duel = '';
    if (r.laneCount > 2) {
      duel = diff < 1
        ? 'Entre ustedes dos: empate exacto.'
        : 'Entre ustedes dos: el <b style="color:' + ahead.color + '">' + ahead.name + '</b> quedó ' + diff + ' m adelante.';
    } else {
      duel = diff < 1 ? '' : 'Ventaja final: ' + diff + ' m';
    }

    const rows = order
      .map((o, i) => {
        const gap = i === 0 ? '—' : '−' + fmtM(order[0].x - o.x);
        return (
          '<li style="--c:' + o.ship.color + '"><span class="place">' + (i + 1) + 'º</span><span class="dot"></span>' +
          '<span class="name">' + o.ship.name + '</span><span class="dist">' + fmtM(o.x) + '</span><span class="gap">' + gap + '</span></li>'
        );
      })
      .join('');

    const cards = r.humans
      .map((s) => {
        const st = s.stats;
        const total = st.correct + st.wrong;
        const acc = total ? Math.round((st.correct / total) * 100) + '%' : '—';
        const items = [
          ['Aciertos', st.correct],
          ['Errores', st.wrong],
          ['Precisión', acc],
          ['Mejor racha', st.bestStreak],
          ['Nivel', OP.Problems.tierFor(st.correct) + 1],
          ['Impulsos', st.dashes],
          ['Asteroides', st.destroyed],
          ['Choques', st.crashes],
        ];
        return (
          '<div class="stat-card p' + s.player + '"><h3>' + s.name.toUpperCase() + '</h3><div class="stat-grid">' +
          items.map((it) => '<div class="stat"><b>' + it[1] + '</b><span>' + it[0] + '</span></div>').join('') +
          '</div></div>'
        );
      })
      .join('');

    $('#results-body').innerHTML =
      '<p class="eyebrow">RESULTADOS</p>' +
      '<h2 class="winner" style="color:' + color + '">' + title + '</h2>' +
      (duel ? '<p class="duel">' + duel + '</p>' : '') +
      '<ol class="ranking">' + rows + '</ol>' +
      '<div class="stats">' + cards + '</div>' +
      '<div class="btns"><button class="btn" id="btn-rematch" type="button">REVANCHA <kbd>Enter</kbd></button>' +
      '<button class="btn ghost" id="btn-menu" type="button">MENÚ <kbd>Esc</kbd></button></div>';
    $('#btn-rematch').addEventListener('click', startGame);
    $('#btn-menu').addEventListener('click', goMenu);
    $('#results').classList.remove('hidden');
  }

  function buildMenu() {
    // Tarjetas de controles generadas desde la configuración
    $('#pcards').innerHTML = OP.CONTROLS.map((ctrl, i) => {
      const k = ctrl.optionLabels;
      return (
        '<div class="pcard p' + i + '"><h3>' + ctrl.name.toUpperCase() + ' · ' + (i === 0 ? 'ROJO' : 'AZUL') + '</h3>' +
        '<div class="pcard-row"><div class="keycross">' +
        '<kbd class="k k0">' + k[0] + '</kbd><kbd class="k k1">' + k[1] + '</kbd><kbd class="k k2">' + k[2] + '</kbd><kbd class="k k3">' + k[3] + '</kbd>' +
        '</div><div class="keylist"><div>Responder: <b>' + k.join(' ') + '</b></div>' +
        '<div><kbd class="k">' + ctrl.modeLabels.accel + '</kbd> Acelerar</div>' +
        '<div><kbd class="k">' + ctrl.modeLabels.shoot + '</kbd> Disparar</div></div></div></div>'
      );
    }).join('');

    document.querySelectorAll('#seg-bots button').forEach((b) => {
      b.classList.toggle('on', Number(b.dataset.v) === G.botLevel);
      b.addEventListener('click', () => {
        G.botLevel = Number(b.dataset.v);
        A.unlock();
        A.sfx.click();
        document.querySelectorAll('#seg-bots button').forEach((x) => x.classList.toggle('on', x === b));
      });
    });
    document.querySelectorAll('#seg-music button').forEach((b) => {
      b.addEventListener('click', () => {
        A.unlock();
        A.setMusicEnabled(b.dataset.v === '1');
        A.sfx.click();
        syncMusicUI();
      });
    });
    $('#btn-start').addEventListener('click', startGame);
    $('#btn-fullscreen').addEventListener('click', toggleFullscreen);
    $('#btn-resume').addEventListener('click', () => setPaused(false));
    $('#btn-quit').addEventListener('click', goMenu);
    $('#btn-pause').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (G.phase === 'race' || G.phase === 'countdown') setPaused(!G.paused);
    });
    $('#btn-sound').addEventListener('pointerdown', (e) => {
      e.preventDefault();
      A.unlock();
      toggleMusic();
    });
    const rh = $('#rotate-hint button');
    if (rh) rh.addEventListener('click', () => $('#rotate-hint').classList.add('dismissed'));
    syncMusicUI();
  }

  function toggleFullscreen() {
    const d = document;
    if (!d.fullscreenElement && d.documentElement.requestFullscreen) {
      d.documentElement.requestFullscreen().then(() => {
        if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
      }).catch(() => {});
    } else if (d.exitFullscreen) {
      d.exitFullscreen().catch(() => {});
    }
  }

  function applyColors() {
    const root = document.documentElement.style;
    COL.players.forEach((c, i) => {
      root.setProperty('--p' + i, c);
      root.setProperty('--p' + i + '-rgb', COL.playersRGB[i].join(','));
    });
  }

  function onResize() {
    G.renderer.resize();
    G.cockpits.forEach((c) => c.resize());
  }

  function init() {
    applyColors();
    G.renderer = new OP.Renderer($('#race-canvas'));
    G.cockpits = [0, 1].map(
      (i) => new OP.Cockpit($('#cockpit-' + i), i, { onOption: handleOption, onMode: handleMode })
    );
    buildMenu();
    newRace(true);
    showMenuStandby();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', () => setTimeout(onResize, 200));
    window.addEventListener('pointerdown', () => A.unlock(), { passive: true });
    window.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && (G.phase === 'race' || G.phase === 'countdown')) setPaused(true);
    });
    window.addEventListener('blur', () => {
      if (G.phase === 'race' || G.phase === 'countdown') setPaused(true);
    });
    requestAnimationFrame(loop);
  }

  // expuesto para pruebas
  OP.Game = { G, startGame, goMenu, handleOption, handleMode, setPaused };

  init();
})();
