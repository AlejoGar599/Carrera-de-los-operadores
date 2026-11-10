/* ==========================================================
   Simulación de la carrera
   Naves, modos (acelerar / disparar), asteroides, disparos,
   choques, rivales IA y clasificación.
   ========================================================== */
(function () {
  'use strict';
  const OP = window.OP;
  const C = OP.CONFIG;
  const U = OP.U;
  const COL = OP.COLORS;

  let nextId = 1;

  class Race {
    /**
     * opts.seed      semilla para asteroides e IA
     * opts.botLevel  0 = sin rivales IA, 1..3 = dificultad de los rivales
     * opts.demo      true = los jugadores también los maneja la IA (fondo del menú)
     * opts.onEvent   callback(tipo, nave, extra)
     */
    constructor(opts) {
      this.rng = U.makeRng(opts.seed || 1);
      this.onEvent = opts.onEvent || function () {};
      this.demo = !!opts.demo;
      this.time = 0;
      this.started = false;
      this.finished = false;
      this.finalOrder = null;
      this.asteroids = [];
      this.shots = [];
      this.particles = [];
      this.shake = 0;

      const botSkill = C.BOT_LEVELS[opts.botLevel || 0];
      const demoSkill = C.BOT_LEVELS[2];

      this.humans = [0, 1].map((i) =>
        this._makeShip({
          kind: 'human',
          player: i,
          name: OP.CONTROLS[i].name,
          short: OP.CONTROLS[i].short,
          rgb: COL.playersRGB[i],
          color: COL.players[i],
          skill: this.demo ? demoSkill : null,
        })
      );

      let lanes = this.humans.slice();
      if (botSkill) {
        const b1 = this._makeShip({ kind: 'bot', name: 'IA 1', short: 'IA1', rgb: COL.botRGB, color: COL.bot, skill: botSkill });
        const b2 = this._makeShip({ kind: 'bot', name: 'IA 2', short: 'IA2', rgb: COL.botRGB, color: COL.bot, skill: botSkill });
        lanes = [b1, this.humans[0], this.humans[1], b2];
      }
      lanes.forEach((s, i) => {
        s.lane = i;
        s.index = i;
      });
      this.ships = lanes;
      this.laneCount = lanes.length;
      this._buildAsteroids();
    }

    _makeShip(o) {
      const s = Object.assign(
        {
          x: 0,
          speed: 0,
          boost: 0,
          stall: 0,
          lock: 0,
          lockTotal: 1,
          lockReason: null,
          mode: 'accel',
          damage: 0,
          flash: 0,
          stats: { correct: 0, wrong: 0, shots: 0, hits: 0, destroyed: 0, crashes: 0, streak: 0, bestStreak: 0, dashes: 0 },
          ai: null,
        },
        o
      );
      if (o.skill) s.ai = { next: 0.8 + this.rng() * 1.6, modeWait: 0, reaction: 0.25 + this.rng() * 0.35 };
      return s;
    }

    laneY(lane) {
      return (lane + 0.5) * C.LANE_H;
    }

    // Misma secuencia de asteroides para todos los carriles (carrera justa)
    _buildAsteroids() {
      const sched = [];
      let x = C.FIRST_ASTEROID;
      while (x < 30000) {
        const p = U.clamp(x / 14000, 0, 1);
        const pBig = 0;
        const pMid = 0;
        const r = this.rng();
        const size = sched.length === 0 ? 1 : r < pBig ? 3 : r < pBig + pMid ? 2 : 1;
        sched.push({ x, size });
        x += U.randRange(this.rng, C.ASTEROID_GAP[0], C.ASTEROID_GAP[1]);
      }
      this.laneAst = this.ships.map(() => []);
      for (const ship of this.ships) {
        const upper = ship.lane < this.laneCount / 2;
        for (const s of sched) {
          const verts = [];
          const n = 8 + s.size * 2;
          for (let i = 0; i < n; i++) verts.push(0.76 + this.rng() * 0.32);
          const a = {
            id: nextId++,
            lane: ship.lane,
            x: s.x + U.randRange(this.rng, -45, 45),
            size: s.size,
            hp: s.size,
            pending: 0,
            r: C.ASTEROID_RADIUS[s.size],
            rot: this.rng() * Math.PI * 2,
            vr: U.randRange(this.rng, -1.1, 1.1),
            verts,
            state: 'waiting', // waiting → entering → active → dead
            enterT: 0,
            // entra desde el borde de pista más cercano
            y0: upper
              ? -(ship.lane + 0.5) * C.LANE_H - 70
              : (this.laneCount - ship.lane - 0.5) * C.LANE_H + 70,
            yOff: 0,
            flash: 0,
            wob: this.rng() * Math.PI * 2,
          };
          this.asteroids.push(a);
          this.laneAst[ship.lane].push(a);
        }
      }
    }

    start() {
      this.started = true;
    }

    finish() {
      if (this.finished) return;
      this.finished = true;
      this.finalOrder = this.standings().map((s) => ({ ship: s, x: s.x }));
    }

    standings() {
      return this.ships.slice().sort((a, b) => b.x - a.x);
    }

    setMode(index, mode) {
      const s = this.ships[index];
      if (!s || s.mode === mode) return;
      s.mode = mode;
      this._emit('mode', s, mode);
    }

    // Asteroide vivo más cercano por delante en el carril de la nave
    _findTarget(s, range, includeWaiting) {
      const list = this.laneAst[s.lane];
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (a.state === 'dead') continue;
        if (a.x + a.r < s.x - C.SHIP_LEN * 0.5) continue;
        if (a.x - s.x > range) break;
        if (!includeWaiting && a.state === 'waiting') continue;
        if (a.hp - a.pending <= 0) continue;
        return a;
      }
      return null;
    }

    // Objetivo al que apuntaría la nave en modo disparo (solo asteroides visibles)
    targetFor(s) {
      return this._findTarget(s, C.SHOT_RANGE, false);
    }

    // Para el aviso del panel: amenaza visible más cercana en el carril
    threatFor(s) {
      const list = this.laneAst[s.lane];
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        if (a.state === 'dead' || a.state === 'waiting') continue;
        if (a.x + a.r < s.x - C.SHIP_LEN * 0.5) continue;
        return { dist: Math.max(0, Math.round(a.x - a.r - s.x - C.SHIP_LEN * 0.5)), hp: a.hp, size: a.size, pending: a.pending };
      }
      return null;
    }

    /** Resultado de una respuesta. Devuelve { effect } o null */
    answer(index, correct) {
      const s = this.ships[index];
      if (!s || !this.started || this.finished) return null;
      const st = s.stats;

      if (correct) {
        st.correct++;
        st.streak++;
        if (st.streak > st.bestStreak) st.bestStreak = st.streak;
        s.flash = 1;
        if (s.mode === 'accel') {
          s.boost = Math.min(s.boost + C.DASH_BOOST, C.DASH_BOOST * C.DASH_MAX_STACK);
          st.dashes++;
          this._emit('dash', s);
          return { effect: 'dash' };
        }
        const target = this._findTarget(s, C.SHOT_RANGE, true);
        st.shots++;
        if (target && target.state === 'waiting') this._startEnter(target);
        if (target) target.pending++;
        this.shots.push({ owner: s, lane: s.lane, x: s.x + C.SHIP_LEN * 0.5, yOff: 0, target, life: 1.8 });
        this._emit(target ? 'shot' : 'noTarget', s);
        return { effect: target ? 'shot' : 'noTarget' };
      }

      st.wrong++;
      st.streak = 0;
      s.damage = 1;
      if (s.mode === 'accel') {
        s.stall = C.STALL_TIME;
        s.speed = 0;
        s.boost = 0;
        s.lock = C.STALL_TIME;
        s.lockTotal = C.STALL_TIME;
        s.lockReason = 'stall';
        this._sparks(s, 10);
        this._emit('stall', s);
        return { effect: 'stall' };
      }
      s.lock = C.SHOOT_COOLDOWN;
      s.lockTotal = C.SHOOT_COOLDOWN;
      s.lockReason = 'jam';
      this._sparks(s, 8);
      this._emit('jam', s);
      return { effect: 'jam' };
    }

    _startEnter(a) {
      a.state = 'entering';
      a.enterT = 0;
      a.yOff = a.y0;
      this._emit('incoming', this.ships[a.lane], a);
    }

    update(dt) {
      if (this.started && !this.finished) this.time += dt;
      const moving = this.started;
      const live = this.started && !this.finished;

      for (const s of this.ships) {
        this._updateShip(s, dt, moving);
        if (live && s.ai) this._updateBot(s, dt);
      }
      this._updateAsteroids(dt);
      this._updateShots(dt);
      if (live) this._collisions();
      this._updateParticles(dt);
      this.shake = Math.max(0, this.shake - dt * 2.2);
    }

    _updateShip(s, dt, moving) {
      s.flash = Math.max(0, s.flash - dt * 3);
      s.damage = Math.max(0, s.damage - dt * 0.9);
      if (s.lock > 0) {
        s.lock = Math.max(0, s.lock - dt);
        if (s.lock === 0) s.lockReason = null;
      }
      if (!moving) return;
      if (s.stall > 0) {
        // detenida: no avanza; un impulso ganado durante el choque se guarda
        s.stall = Math.max(0, s.stall - dt);
        s.speed = 0;
        if (Math.random() < dt * 14) this._sparks(s, 1);
        return;
      }
      if (s.speed < C.BASE_SPEED) s.speed = Math.min(C.BASE_SPEED, s.speed + C.RECOVER_ACCEL * dt);
      if (s.boost > 0) s.boost = Math.max(0, s.boost - (C.DASH_BOOST / C.DASH_TIME) * dt);
      s.x += (s.speed + s.boost) * dt;
    }

    _updateBot(s, dt) {
      const ai = s.ai;
      const target = this._findTarget(s, C.ASTEROID_ENTER_DIST, false);
      const want = target ? 'shoot' : 'accel';
      if (want !== s.mode) {
        ai.modeWait += dt;
        if (ai.modeWait >= ai.reaction) {
          this.setMode(s.index, want);
          ai.modeWait = 0;
        }
      } else {
        ai.modeWait = 0;
      }
      if (s.lock > 0) return;
      ai.next -= dt;
      if (ai.next <= 0) {
        const correct = this.rng() < s.skill.accuracy;
        this.answer(s.index, correct);
        ai.next = s.skill.interval * U.randRange(this.rng, 0.6, 1.4);
      }
    }

    _updateAsteroids(dt) {
      for (const a of this.asteroids) {
        if (a.state === 'dead') continue;
        a.rot += a.vr * dt;
        a.flash = Math.max(0, a.flash - dt * 5);
        if (a.state === 'waiting') {
          const owner = this.ships[a.lane];
          if (this.started && a.x - owner.x < C.ASTEROID_ENTER_DIST) this._startEnter(a);
        } else if (a.state === 'entering') {
          a.enterT += dt;
          const k = U.clamp(a.enterT / C.ASTEROID_ENTER_TIME, 0, 1);
          a.yOff = a.y0 * (1 - U.easeOutCubic(k));
          if (k >= 1) {
            a.state = 'active';
            a.yOff = 0;
          }
        } else {
          a.yOff = Math.sin(this.time * 1.4 + a.wob) * 7;
        }
      }
    }

    _updateShots(dt) {
      for (let i = this.shots.length - 1; i >= 0; i--) {
        const sh = this.shots[i];
        sh.life -= dt;
        sh.x += C.SHOT_SPEED * dt;
        const t = sh.target;
        if (t && t.state === 'dead') sh.target = null;
        if (sh.target) {
          sh.yOff += (t.yOff - sh.yOff) * Math.min(1, dt * 14);
          if (sh.x >= t.x - t.r * 0.6) {
            this._hit(t, sh);
            this.shots.splice(i, 1);
            continue;
          }
        }
        if (sh.life <= 0) this.shots.splice(i, 1);
      }
    }

    _hit(a, sh) {
      a.pending = Math.max(0, a.pending - 1);
      a.hp--;
      a.flash = 1;
      sh.owner.stats.hits++;
      const y = this.laneY(a.lane) + a.yOff;
      this._burst(a.x - a.r * 0.7, y, 8, sh.owner.rgb, 260, 0.45, 'spark', -1);
      if (a.hp <= 0) {
        a.state = 'dead';
        sh.owner.stats.destroyed++;
        this._burst(a.x, y, 10 + a.size * 6, COL.inkRGB, 200 + a.size * 40, 0.9, 'shard', 0);
        this._burst(a.x, y, 10, sh.owner.rgb, 320, 0.6, 'spark', 0);
        this.particles.push({ kind: 'ring', x: a.x, y, r: a.r, life: 0.5, max: 0.5, rgb: sh.owner.rgb });
        this.shake = Math.max(this.shake, 0.12 * a.size);
        this._emit('destroy', sh.owner, a);
      } else {
        this._emit('hit', sh.owner, a);
      }
    }

    _collisions() {
      const half = C.SHIP_LEN * 0.5;
      for (const s of this.ships) {
        const list = this.laneAst[s.lane];
        for (let i = 0; i < list.length; i++) {
          const a = list[i];
          if (a.state === 'dead' || a.state === 'waiting') continue;
          if (a.x - a.r > s.x + half + 80) break;
          if (Math.abs(a.yOff) > C.LANE_H * 0.45) continue;
          if (s.x + half >= a.x - a.r * 0.85 && s.x - half <= a.x + a.r) {
            a.state = 'dead';
            const t = C.CRASH_STALL[a.size];
            s.stall = Math.max(s.stall, t);
            s.speed = 0;
            s.boost = 0;
            s.damage = 1;
            if (t > s.lock) {
              s.lock = t;
              s.lockTotal = t;
              s.lockReason = 'crash';
            }
            s.stats.crashes++;
            const y = this.laneY(a.lane) + a.yOff;
            this._burst(a.x, y, 12 + a.size * 5, COL.inkRGB, 240, 0.9, 'shard', 0);
            this._burst(s.x + half, this.laneY(s.lane), 14, s.rgb, 300, 0.6, 'spark', 0);
            this.shake = Math.max(this.shake, 0.3 + 0.1 * a.size);
            this._emit('crash', s, a);
          }
        }
      }
    }

    _sparks(s, n) {
      this._burst(s.x, this.laneY(s.lane), n, s.rgb, 160, 0.5, 'spark', 0);
    }

    // dir: -1 hacia atrás, 0 en todas direcciones
    _burst(x, y, n, rgb, speed, life, kind, dir) {
      if (this.particles.length > 700) return;
      for (let i = 0; i < n; i++) {
        let ang = Math.random() * Math.PI * 2;
        if (dir === -1) ang = Math.PI + (Math.random() - 0.5) * 1.6;
        const v = speed * (0.35 + Math.random() * 0.65);
        const l = life * (0.6 + Math.random() * 0.6);
        this.particles.push({
          kind,
          x,
          y,
          vx: Math.cos(ang) * v,
          vy: Math.sin(ang) * v,
          life: l,
          max: l,
          rgb,
          size: kind === 'shard' ? 4 + Math.random() * 8 : 3 + Math.random() * 5,
          rot: Math.random() * 6.28,
          vr: (Math.random() - 0.5) * 10,
        });
      }
    }

    _updateParticles(dt) {
      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.life -= dt;
        if (p.life <= 0) {
          this.particles.splice(i, 1);
          continue;
        }
        if (p.kind !== 'ring') {
          p.x += p.vx * dt;
          p.y += p.vy * dt;
          p.vx *= 1 - dt * 2.2;
          p.vy *= 1 - dt * 2.2;
          p.rot += p.vr * dt;
        }
      }
    }

    _emit(type, ship, extra) {
      try {
        this.onEvent(type, ship, extra);
      } catch (e) {
        console.error(e);
      }
    }
  }

  OP.Race = Race;
})();
