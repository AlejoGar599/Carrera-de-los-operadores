/* ==========================================================
   Cabina del piloto (mitad inferior, una por jugador)
   Vista POV con pantalla holográfica, 4 opciones en cruz
   (arriba / izquierda / abajo / derecha) y panel de modos.
   ========================================================== */
(function () {
  'use strict';
  const OP = window.OP;
  const U = OP.U;
  const COL = OP.COLORS;

  const ICONS = {
    accel: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5l7 7-7 7M12 5l7 7-7 7"/></svg>',
    shoot: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="6.5"/><path d="M12 1.5v6M12 16.5v6M1.5 12h6M16.5 12h6"/></svg>',
  };
  const MODE = {
    accel: { name: 'ACELERAR', hint: '<b>ACELERAR</b> · acierto: impulso · error: te detienes' },
    shoot: { name: 'DISPARAR', hint: '<b>DISPARAR</b> · acierto: disparo · error: armas bloqueadas' },
  };
  const EFFECT_TEXT = {
    dash: '▶▶ IMPULSO',
    shot: '✦ DISPARO',
    noTarget: 'SIN OBJETIVO',
    stall: '✕ MOTOR AVERIADO',
    jam: '✕ ARMAS AVERIADAS',
  };
  const LOCK_TEXT = {
    stall: 'AVERÍA · MOTOR DETENIDO',
    jam: 'AVERÍA · ARMAS REINICIANDO',
    crash: 'IMPACTO · SISTEMAS DAÑADOS',
  };
  const TASK_TEXT = { result: '¿CUÁNTO DA?', operator: '¿QUÉ OPERADOR?' };
  const COLOR_NAME = ['ROJO', 'AZUL'];

  class Cockpit {
    constructor(root, player, handlers) {
      this.root = root;
      this.player = player;
      this.handlers = handlers;
      const ctrl = OP.CONTROLS[player];
      root.classList.add('p' + player);

      const opts = [0, 1, 2, 3]
        .map(
          (i) =>
            '<button class="opt s' + i + '" data-slot="' + i + '" tabindex="-1" type="button">' +
            '<kbd>' + ctrl.optionLabels[i] + '</kbd><span class="val"></span></button>'
        )
        .join('');

      root.innerHTML =
        '<canvas class="windshield"></canvas>' +
        '<div class="strut strut-l"></div><div class="strut strut-r"></div>' +
        '<div class="dash"><i></i><i></i><i></i><i></i><i></i></div>' +
        '<div class="console">' +
        '  <div class="holo"><div class="holo-inner">' +
        '    <header class="holo-head"><span class="pilot">' + ctrl.short + ' · ' + COLOR_NAME[player] + '</span>' +
        '      <span class="task"></span><span class="lvl">NIVEL 1</span></header>' +
        '    <div class="warn"><span class="warn-ico">!</span><span class="warn-text"></span></div>' +
        '    <div class="expr"></div>' +
        '    <div class="opts">' + opts + '</div>' +
        '    <div class="hint"></div>' +
        '    <div class="lock"><div class="lock-label"></div><div class="lock-answer"></div><div class="lock-bar"><i></i></div></div>' +
        '    <div class="standby"><div class="standby-text"></div><div class="standby-sub"></div></div>' +
        '    <div class="fx"></div>' +
        '  </div></div>' +
        '  <div class="modes">' +
        '    <div class="modes-title">MODO</div>' +
        '    <button class="mode" data-mode="accel" tabindex="-1" type="button">' + ICONS.accel +
        '      <span class="mode-name">ACELERAR</span><kbd>' + ctrl.modeLabels.accel + '</kbd></button>' +
        '    <button class="mode" data-mode="shoot" tabindex="-1" type="button">' + ICONS.shoot +
        '      <span class="mode-name">DISPARAR</span><kbd>' + ctrl.modeLabels.shoot + '</kbd></button>' +
        '  </div>' +
        '</div>';

      const q = (s) => root.querySelector(s);
      this.el = {
        canvas: q('.windshield'),
        console: q('.console'),
        inner: q('.holo-inner'),
        task: q('.task'),
        lvl: q('.lvl'),
        warn: q('.warn'),
        warnText: q('.warn-text'),
        expr: q('.expr'),
        opts: Array.from(root.querySelectorAll('.opt')),
        vals: Array.from(root.querySelectorAll('.opt .val')),
        hint: q('.hint'),
        lock: q('.lock'),
        lockLabel: q('.lock-label'),
        lockAnswer: q('.lock-answer'),
        lockBar: q('.lock-bar i'),
        standby: q('.standby'),
        standbyText: q('.standby-text'),
        standbySub: q('.standby-sub'),
        fx: q('.fx'),
        modes: {
          accel: q('.mode[data-mode="accel"]'),
          shoot: q('.mode[data-mode="shoot"]'),
        },
      };

      this.el.opts.forEach((b, i) => {
        b.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          this.handlers.onOption(this.player, i);
        });
      });
      Object.keys(this.el.modes).forEach((m) => {
        this.el.modes[m].addEventListener('pointerdown', (e) => {
          e.preventDefault();
          this.handlers.onMode(this.player, m);
        });
      });

      // Parabrisas: estrellas que vienen hacia el piloto
      this.ws = { ctx: this.el.canvas.getContext('2d'), w: 1, h: 1, dpr: 1, speed: 0, stars: [] };
      for (let i = 0; i < 80; i++) this.ws.stars.push(this._newStar(true));

      this.lockOn = false;
      this.warnKey = '';
      this.mode = null;
      this.resize();
      this.setMode('accel');
    }

    _newStar(anyDepth) {
      return {
        x: (Math.random() - 0.5) * 2.2,
        y: (Math.random() - 0.5) * 1.6,
        z: anyDepth ? 0.15 + Math.random() * 0.85 : 1,
      };
    }

    resize() {
      const r = this.el.canvas.getBoundingClientRect();
      const ws = this.ws;
      ws.dpr = Math.min(window.devicePixelRatio || 1, 2);
      ws.w = Math.max(1, r.width);
      ws.h = Math.max(1, r.height);
      this.el.canvas.width = Math.round(ws.w * ws.dpr);
      this.el.canvas.height = Math.round(ws.h * ws.dpr);
    }

    // speedK: velocidad relativa (1 = normal), stalled: nave detenida
    updateWindshield(dt, speedK, stalled) {
      const ws = this.ws;
      const ctx = ws.ctx;
      ws.speed = U.lerp(ws.speed, stalled ? 0 : speedK, Math.min(1, dt * 6));
      ctx.setTransform(ws.dpr, 0, 0, ws.dpr, 0, 0);
      ctx.clearRect(0, 0, ws.w, ws.h);
      const cx = ws.w * 0.5;
      const cy = ws.h * 0.3;
      const f = Math.max(ws.w, ws.h) * 0.45;
      const rgb = COL.playersRGB[this.player];
      ctx.lineCap = 'round';
      for (const st of ws.stars) {
        st.z -= dt * (0.04 + ws.speed * 0.42);
        if (st.z <= 0.04) {
          Object.assign(st, this._newStar(false));
          continue;
        }
        const zt = Math.min(1.2, st.z + 0.01 + ws.speed * 0.05);
        const x1 = cx + (st.x / st.z) * f;
        const y1 = cy + (st.y / st.z) * f;
        const x0 = cx + (st.x / zt) * f;
        const y0 = cy + (st.y / zt) * f;
        if (x1 < -20 || x1 > ws.w + 20 || y1 < -20 || y1 > ws.h + 20) {
          Object.assign(st, this._newStar(false));
          continue;
        }
        const a = U.clamp((1 - st.z) * 1.3, 0, 0.9);
        ctx.strokeStyle = st.x > 0.9 || st.x < -0.9 ? U.rgba(rgb, a) : U.rgba(COL.inkRGB, a);
        ctx.lineWidth = 0.4 + (1 - st.z) * 2;
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }
    }

    reset() {
      this.el.expr.innerHTML = '';
      this.el.task.textContent = '';
      this.el.vals.forEach((v) => (v.textContent = ''));
      this.el.opts.forEach((b) => b.classList.remove('right', 'wrong', 'chosen'));
      this.setLock(0, 1, null);
      this.setWarning(null);
      this.setLevel(0, 0);
      this.root.classList.remove('shake');
      this.el.inner.classList.remove('ok', 'bad');
    }

    showStandby(text, sub) {
      this.el.standbyText.textContent = text;
      this.el.standbySub.innerHTML = sub || '';
      this.el.standby.classList.add('on');
    }

    hideStandby() {
      this.el.standby.classList.remove('on');
    }

    setProblem(p) {
      this.hideStandby();
      let chars = 0;
      this.el.expr.innerHTML = p.tokens
        .map((t) => {
          chars += t.k === 'blank' ? 1.6 : t.v.length;
          return '<span class="t t-' + t.k + '">' + t.v + '</span>';
        })
        .join('');
      this.el.expr.style.setProperty('--fit', (chars + p.tokens.length * 0.45).toFixed(2));
      this.el.task.textContent = TASK_TEXT[p.kind];
      this.el.inner.classList.toggle('kind-operator', p.kind === 'operator');
      this.el.opts.forEach((b, i) => {
        b.classList.remove('right', 'wrong', 'chosen');
        this.el.vals[i].textContent = p.options[i];
      });
      this.el.expr.classList.remove('enter');
      void this.el.expr.offsetWidth;
      this.el.expr.classList.add('enter');
    }

    press(slot) {
      const b = this.el.opts[slot];
      b.classList.remove('press');
      void b.offsetWidth;
      b.classList.add('press');
    }

    feedback(correct, chosen, problem, effect, streak) {
      const b = this.el.opts;
      b[chosen].classList.add('chosen');
      // completa la operación con la respuesta correcta
      const blanks = this.el.expr.querySelectorAll('.t-blank');
      if (blanks.length) {
        const bl = blanks[0];
        bl.textContent = problem.options[problem.correct];
        bl.classList.add('t-reveal');
      }
      if (correct) {
        b[chosen].classList.add('right');
        this._flash('ok');
        const milestone = streak >= 5 && streak % 5 === 0 ? ' · RACHA ' + streak : '';
        this.fx((EFFECT_TEXT[effect] || '✓') + milestone, milestone ? 'lvl' : 'ok');
      } else {
        b[chosen].classList.add('wrong');
        b[problem.correct].classList.add('right');
        this._flash('bad');
        this.fx(EFFECT_TEXT[effect] || '✕', 'bad');
        this.el.lockAnswer.textContent = 'Respuesta correcta: ' + problem.options[problem.correct];
      }
    }

    _flash(cls) {
      const el = this.el.inner;
      el.classList.remove('ok', 'bad');
      void el.offsetWidth;
      el.classList.add(cls);
    }

    fx(text, cls) {
      const el = this.el.fx;
      el.textContent = text;
      el.className = 'fx';
      void el.offsetWidth;
      el.className = 'fx show ' + (cls || '');
    }

    crash() {
      this.root.classList.remove('shake');
      void this.root.offsetWidth;
      this.root.classList.add('shake');
      this.fx('¡IMPACTO!', 'bad');
    }

    setLock(remaining, total, reason) {
      const on = remaining > 0;
      if (on !== this.lockOn) {
        this.lockOn = on;
        this.el.lock.classList.toggle('on', on);
        if (!on) {
          this.el.lockAnswer.textContent = '';
          this.lockReason = null;
        }
      }
      if (on && reason !== this.lockReason) {
        this.lockReason = reason;
        this.el.lockLabel.textContent = LOCK_TEXT[reason] || 'AVERÍA';
      }
      if (on) this.el.lockBar.style.transform = 'scaleX(' + U.clamp(remaining / (total || 1), 0, 1).toFixed(3) + ')';
    }

    setMode(mode) {
      if (this.mode === mode) return;
      this.mode = mode;
      this.root.classList.toggle('mode-accel', mode === 'accel');
      this.root.classList.toggle('mode-shoot', mode === 'shoot');
      this.el.modes.accel.classList.toggle('active', mode === 'accel');
      this.el.modes.shoot.classList.toggle('active', mode === 'shoot');
      this.el.hint.innerHTML = MODE[mode].hint;
    }

    setLevel(tier) {
      this.el.lvl.textContent = 'NIVEL ' + (tier + 1);
    }

    setWarning(info) {
      if (!info) {
        if (this.warnKey !== '') {
          this.warnKey = '';
          this.el.warn.classList.remove('on', 'near');
        }
        return;
      }
      const dist = Math.round(info.dist / 10) * 10;
      const left = Math.max(0, info.hp - info.pending);
      const key = dist + '|' + info.hp + '|' + left;
      if (key === this.warnKey) return;
      this.warnKey = key;
      let need;
      if (left === 0) need = 'en la mira';
      else need = left === 1 ? '1 disparo' : left + ' disparos';
      this.el.warnText.textContent = 'ASTEROIDE EN TU CARRIL · ' + dist + ' m · ' + need;
      this.el.warn.classList.add('on');
      this.el.warn.classList.toggle('near', info.dist < 380 && left > 0);
    }
  }

  OP.Cockpit = Cockpit;
})();
