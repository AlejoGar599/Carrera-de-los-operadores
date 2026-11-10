/* ==========================================================
   Render de la carrera (mitad superior, vista cenital)
   ========================================================== */
(function () {
  'use strict';
  const OP = window.OP;
  const C = OP.CONFIG;
  const U = OP.U;
  const COL = OP.COLORS;
  const INK = COL.inkRGB;
  const FONT = '"Bahnschrift", "DIN Alternate", "Segoe UI", "Roboto Condensed", system-ui, sans-serif';

  function hexPath(ctx, r) {
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
      else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
  }

  function chevron(ctx, x, y, len, wid) {
    ctx.beginPath();
    ctx.moveTo(x + len * 0.5, y);
    ctx.lineTo(x - len * 0.5, y - wid * 0.5);
    ctx.lineTo(x - len * 0.22, y);
    ctx.lineTo(x - len * 0.5, y + wid * 0.5);
    ctx.closePath();
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.dpr = 1;
      this.w = 1;
      this.h = 1;
      this.camX = 0;
      this.camVel = 0;
      this.camInit = false;
      this.viewW = C.VIEW_MIN_W;
      this.pulse = 0;
      this.t = 0;
      const rng = U.makeRng(1234);
      this.stars = [];
      for (let i = 0; i < 150; i++) this.stars.push({ x: rng(), y: rng(), d: 0.1 + rng() * 0.9 });
      this.resize();
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      this.dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.w = Math.max(1, r.width);
      this.h = Math.max(1, r.height);
      this.canvas.width = Math.round(this.w * this.dpr);
      this.canvas.height = Math.round(this.h * this.dpr);
    }

    reset() {
      this.camInit = false;
      this.camVel = 0;
      this.pulse = 0;
    }

    onEvent(type) {
      if (type === 'dash' || type === 'destroy') this.pulse = Math.min(1, this.pulse + 0.3);
      else if (type === 'crash') this.pulse = Math.min(1, this.pulse + 0.2);
    }

    layout(race) {
      const trackH = race.laneCount * C.LANE_H;
      const s = Math.min(this.w / C.VIEW_MIN_W, (this.h * C.TRACK_FILL) / trackH);
      const top = (this.h - trackH * s) * 0.56;
      return { s, top, bottom: top + trackH * s };
    }

    sx(x, L) {
      return (x - this.camX) * L.s;
    }

    sy(race, lane, yOff, L) {
      return L.top + (race.laneY(lane) + (yOff || 0)) * L.s;
    }

    draw(race, view, dt) {
      this.t += dt;
      this.pulse = Math.max(0, this.pulse - dt * 1.6);
      const ctx = this.ctx;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      const L = this.layout(race);
      this._camera(race, L, dt);
      const progress = U.clamp(race.time / C.RACE_TIME, 0, 1);
      this._background(progress);
      this._stars(L);
      ctx.save();
      if (race.shake > 0) {
        const m = race.shake * 9;
        ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
      }
      this._track(race, L);
      this._asteroids(race, L);
      this._shots(race, L);
      this._ships(race, L);
      this._particles(race, L);
      ctx.restore();
      this._offscreen(race, L);
      this._hud(race, L, view);
    }

    _camera(race, L, dt) {
      let lo = Infinity;
      let hi = -Infinity;
      for (const s of race.humans) {
        lo = Math.min(lo, s.x);
        hi = Math.max(hi, s.x);
      }
      this.viewW = this.w / L.s;
      const target = (lo + hi) / 2 - this.viewW * 0.42;
      const prev = this.camX;
      if (!this.camInit) {
        this.camX = target;
        this.camInit = true;
        this.camVel = 0;
        return;
      }
      if (dt <= 0) return;
      this.camX += (target - this.camX) * Math.min(1, dt * 4);
      this.camVel = U.lerp(this.camVel, (this.camX - prev) / dt, Math.min(1, dt * 6));
    }

    _background(p) {
      const ctx = this.ctx;
      const w = this.w;
      const h = this.h;
      const base = U.mixRGB(COL.bgStart, COL.bgEnd, p);
      ctx.fillStyle = U.rgba(base, 1);
      ctx.fillRect(0, 0, w, h);

      const glow = U.mixRGB(base, [110, 80, 255], 0.2 + this.pulse * 0.15);
      const g = ctx.createRadialGradient(w * 0.5, h * 0.5, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.62);
      g.addColorStop(0, U.rgba(glow, 0.5));
      g.addColorStop(1, U.rgba(base, 0));
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // Hexágonos concéntricos que se expanden (guiño a Super Hexagon)
      ctx.save();
      ctx.translate(w / 2, h / 2);
      ctx.rotate(this.t * 0.1);
      const R = Math.max(w, h) * 0.8;
      const phase = (this.t * 0.16) % 1;
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 6; k++) {
        const f = (k + phase) / 6;
        ctx.strokeStyle = U.rgba(INK, 0.06 * (1 - f) + this.pulse * 0.05 * (1 - f));
        hexPath(ctx, f * R);
        ctx.stroke();
      }
      ctx.strokeStyle = U.rgba(INK, 0.03);
      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3 + Math.PI / 6;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * R, Math.sin(a) * R);
        ctx.stroke();
      }
      ctx.restore();
    }

    _stars(L) {
      const ctx = this.ctx;
      const span = this.w + 240;
      const vel = this.camVel * L.s;
      ctx.lineCap = 'round';
      for (const st of this.stars) {
        const par = 0.12 + st.d * 0.55;
        let x = (st.x * span - this.camX * L.s * par) % span;
        if (x < 0) x += span;
        x -= 120;
        const y = st.y * this.h;
        const len = Math.max(1.2, Math.min(180, vel * par * 0.07));
        ctx.strokeStyle = U.rgba(INK, 0.12 + st.d * 0.45);
        ctx.lineWidth = 0.6 + st.d * 1.3;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - len, y);
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }

    _track(race, L) {
      const ctx = this.ctx;
      const w = this.w;
      const s = L.s;
      const laneH = C.LANE_H * s;

      for (let i = 0; i < race.laneCount; i++) {
        const ship = race.ships[i];
        ctx.fillStyle = ship.kind === 'human' ? U.rgba(ship.rgb, 0.075) : U.rgba(INK, 0.025);
        ctx.fillRect(0, L.top + i * laneH, w, laneH);
      }

      // separadores de carril
      ctx.setLineDash([26 * s, 34 * s]);
      ctx.lineDashOffset = (this.camX * s) % (60 * s);
      ctx.strokeStyle = U.rgba(INK, 0.2);
      ctx.lineWidth = 1.5;
      for (let i = 1; i < race.laneCount; i++) {
        const y = L.top + i * laneH;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      // bordes de pista
      ctx.strokeStyle = U.rgba(INK, 0.55);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, L.top);
      ctx.lineTo(w, L.top);
      ctx.moveTo(0, L.bottom);
      ctx.lineTo(w, L.bottom);
      ctx.stroke();

      // marcas de distancia
      ctx.font = '600 ' + Math.max(9, 11 * Math.min(1.3, s + 0.2)) + 'px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      const first = Math.floor(this.camX / 250) * 250;
      for (let m = first; m < this.camX + this.viewW + 250; m += 250) {
        if (m <= 0) continue;
        const x = this.sx(m, L);
        const big = m % 1000 === 0;
        ctx.strokeStyle = U.rgba(INK, big ? 0.6 : 0.28);
        ctx.lineWidth = big ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(x, L.top - (big ? 9 : 5));
        ctx.lineTo(x, L.top);
        ctx.moveTo(x, L.bottom);
        ctx.lineTo(x, L.bottom + (big ? 9 : 5));
        ctx.stroke();
        // sin etiqueta donde están el reloj y los botones
        if (big && Math.abs(x - w / 2) > 90 && x < w - 110) {
          ctx.fillStyle = U.rgba(INK, 0.5);
          ctx.fillText(m / 1000 + ' km', x, L.top - 11);
        }
      }

      // línea de salida
      const x0 = this.sx(0, L);
      if (x0 > -30 && x0 < w + 30) {
        const sq = Math.max(5, 9 * s);
        const rows = Math.ceil((L.bottom - L.top) / sq);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < 2; c++) {
            ctx.fillStyle = (r + c) % 2 === 0 ? U.rgba(INK, 0.7) : U.rgba(INK, 0.08);
            ctx.fillRect(x0 - sq * 2 + c * sq, L.top + r * sq, sq, Math.min(sq, L.bottom - L.top - r * sq));
          }
        }
      }
    }

    _asteroids(race, L) {
      const ctx = this.ctx;
      const s = L.s;
      const xa = this.camX - 120;
      const xb = this.camX + this.viewW + 120;
      for (const a of race.asteroids) {
        if (a.state === 'dead' || a.state === 'waiting') continue;
        if (a.x < xa || a.x > xb) continue;
        const x = this.sx(a.x, L);
        const y = this.sy(race, a.lane, a.yOff, L);
        const r = a.r * s;

        if (a.state === 'entering') {
          const k = U.clamp(a.enterT / C.ASTEROID_ENTER_TIME, 0, 1);
          const dir = Math.sign(a.y0);
          ctx.strokeStyle = U.rgba(INK, 0.22 * (1 - k));
          ctx.lineWidth = r * 1.3;
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + dir * Math.min(Math.abs(a.yOff) * s, 110 * s));
          ctx.stroke();
          ctx.lineCap = 'butt';
        }

        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(a.rot);
        ctx.beginPath();
        const n = a.verts.length;
        for (let i = 0; i < n; i++) {
          const ang = (i / n) * Math.PI * 2;
          const rr = r * a.verts[i];
          if (i === 0) ctx.moveTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
          else ctx.lineTo(Math.cos(ang) * rr, Math.sin(ang) * rr);
        }
        ctx.closePath();
        ctx.fillStyle = 'rgba(16, 12, 44, 0.94)';
        ctx.fill();
        ctx.lineWidth = Math.max(1.5, 2.2 * s);
        ctx.strokeStyle = COL.asteroid;
        ctx.stroke();
        if (a.flash > 0) {
          ctx.fillStyle = U.rgba(INK, a.flash * 0.85);
          ctx.fill();
        }
        if (a.size >= 2) {
          ctx.lineWidth = Math.max(1, 1.4 * s);
          ctx.strokeStyle = U.rgba(INK, 0.32);
          ctx.beginPath();
          ctx.arc(r * 0.25, -r * 0.18, r * 0.22, 0, Math.PI * 2);
          ctx.stroke();
          if (a.size === 3) {
            ctx.beginPath();
            ctx.arc(-r * 0.32, r * 0.26, r * 0.15, 0, Math.PI * 2);
            ctx.stroke();
          }
        }
        ctx.restore();

        // vida restante (disparos necesarios)
        const pip = Math.max(2.2, 3.2 * s);
        const gap = pip * 3.1;
        for (let i = 0; i < a.size; i++) {
          const px = x - ((a.size - 1) * gap) / 2 + i * gap;
          const py = y - r - pip * 2.6;
          ctx.beginPath();
          ctx.arc(px, py, pip, 0, Math.PI * 2);
          if (i < a.hp) {
            ctx.fillStyle = COL.asteroid;
            ctx.fill();
          } else {
            ctx.strokeStyle = U.rgba(INK, 0.35);
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        }
      }
    }

    _shots(race, L) {
      const ctx = this.ctx;
      const s = L.s;
      for (const sh of race.shots) {
        const x = this.sx(sh.x, L);
        const y = this.sy(race, sh.lane, sh.yOff, L);
        const alpha = U.clamp(sh.life * 3, 0, 1);
        ctx.save();
        ctx.shadowColor = U.rgba(sh.owner.rgb, 1);
        ctx.shadowBlur = 10 * this.dpr;
        ctx.lineCap = 'round';
        ctx.lineWidth = Math.max(2, 3.2 * s);
        ctx.strokeStyle = U.rgba(sh.owner.rgb, 0.7 * alpha);
        ctx.beginPath();
        ctx.moveTo(x - 46 * s, y);
        ctx.lineTo(x - 20 * s, y);
        ctx.stroke();
        ctx.strokeStyle = U.rgba(INK, alpha);
        ctx.beginPath();
        ctx.moveTo(x - 22 * s, y);
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.restore();
      }
    }

    _ships(race, L) {
      for (const sh of race.ships) {
        const x = this.sx(sh.x, L);
        if (x < -80 || x > this.w + 80) continue;
        this._ship(race, sh, x, this.sy(race, sh.lane, 0, L), L);
      }
    }

    _ship(race, sh, x, y, L) {
      const ctx = this.ctx;
      const s = L.s;
      const len = C.SHIP_LEN * s;
      const wid = C.SHIP_W * s;
      const stalled = sh.stall > 0;
      const rgb = stalled ? U.mixRGB(sh.rgb, [110, 110, 135], 0.55) : sh.rgb;
      const blink = sh.damage > 0.08 && Math.floor(this.t * 18) % 2 === 0;
      const moving = race.started && !stalled;

      // apuntado al asteroide (modo disparo)
      if (sh.mode === 'shoot') {
        const t = race.targetFor(sh);
        if (t) {
          const tx = this.sx(t.x, L);
          const ty = this.sy(race, t.lane, t.yOff, L);
          ctx.save();
          ctx.setLineDash([4, 7]);
          ctx.strokeStyle = U.rgba(sh.rgb, 0.45);
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x + len * 0.75, y);
          ctx.lineTo(tx - t.r * s - 6, ty);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.strokeStyle = U.rgba(sh.rgb, 0.9);
          ctx.lineWidth = 2;
          const rr = t.r * s + 7;
          const rot = this.t * 2;
          for (let i = 0; i < 4; i++) {
            const a0 = rot + (i * Math.PI) / 2;
            ctx.beginPath();
            ctx.arc(tx, ty, rr, a0, a0 + 0.7);
            ctx.stroke();
          }
          ctx.restore();
        }
      }

      // imágenes fantasma del impulso
      const boostK = sh.boost / C.DASH_BOOST;
      if (boostK > 0.02 && !stalled) {
        ctx.fillStyle = U.rgba(sh.rgb, 1);
        for (let k = 1; k <= 4; k++) {
          ctx.globalAlpha = 0.3 * Math.min(1, boostK) * (1 - k / 5);
          chevron(ctx, x - k * len * 0.6 * Math.min(1.3, boostK), y, len, wid);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }

      // llama del motor
      if (moving) {
        const thrust = (sh.speed + sh.boost) / C.BASE_SPEED;
        const fl = len * (0.22 + 0.2 * thrust) * (0.85 + Math.random() * 0.3);
        const bx = x - len * 0.26;
        ctx.beginPath();
        ctx.moveTo(bx, y - wid * 0.2);
        ctx.lineTo(bx - fl, y);
        ctx.lineTo(bx, y + wid * 0.2);
        ctx.closePath();
        ctx.fillStyle = U.rgba(sh.rgb, 0.7);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(bx, y - wid * 0.09);
        ctx.lineTo(bx - fl * 0.55, y);
        ctx.lineTo(bx, y + wid * 0.09);
        ctx.closePath();
        ctx.fillStyle = U.rgba(INK, 0.9);
        ctx.fill();
      }

      // aletas de velocidad (modo aceleración) / cañón (modo disparo)
      if (sh.mode === 'accel') {
        if (moving) {
          ctx.strokeStyle = U.rgba(rgb, 0.75);
          ctx.lineWidth = Math.max(1.2, 1.8 * s);
          const fy = wid * 0.66;
          const fl = len * (0.35 + 0.4 * boostK);
          ctx.beginPath();
          ctx.moveTo(x - len * 0.15, y - fy);
          ctx.lineTo(x - len * 0.15 - fl, y - fy);
          ctx.moveTo(x - len * 0.15, y + fy);
          ctx.lineTo(x - len * 0.15 - fl, y + fy);
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = U.rgba(INK, 0.95);
        ctx.lineWidth = Math.max(2, 3 * s);
        ctx.beginPath();
        ctx.moveTo(x + len * 0.3, y);
        ctx.lineTo(x + len * 0.78, y);
        ctx.stroke();
      }

      // cuerpo
      ctx.save();
      ctx.shadowColor = U.rgba(rgb, 0.9);
      ctx.shadowBlur = 14 * this.dpr;
      chevron(ctx, x, y, len, wid);
      ctx.fillStyle = blink ? U.rgba(INK, 0.9) : U.rgba(rgb, 1);
      ctx.fill();
      ctx.restore();
      if (sh.flash > 0) {
        chevron(ctx, x, y, len * (1 + sh.flash * 0.25), wid * (1 + sh.flash * 0.25));
        ctx.strokeStyle = U.rgba(INK, sh.flash);
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // etiqueta
      ctx.font = '700 ' + Math.max(10, Math.round(13 * Math.min(1.4, s + 0.15))) + 'px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = U.rgba(sh.rgb, 0.95);
      ctx.fillText(sh.short, x - len * 0.1, y - wid * 0.8);
    }

    _particles(race, L) {
      const ctx = this.ctx;
      const s = L.s;
      ctx.lineCap = 'round';
      for (const p of race.particles) {
        const k = p.life / p.max;
        const x = this.sx(p.x, L);
        const y = L.top + p.y * s;
        if (p.kind === 'ring') {
          ctx.strokeStyle = U.rgba(p.rgb, k);
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(x, y, (p.r + (1 - k) * 70) * s, 0, Math.PI * 2);
          ctx.stroke();
          continue;
        }
        ctx.strokeStyle = U.rgba(p.rgb, k);
        ctx.lineWidth = p.kind === 'shard' ? 1.6 : 2;
        const len = p.size * s;
        ctx.beginPath();
        if (p.kind === 'spark') {
          const vl = Math.hypot(p.vx, p.vy) || 1;
          ctx.moveTo(x, y);
          ctx.lineTo(x - (p.vx / vl) * len * 1.8, y - (p.vy / vl) * len * 1.8);
        } else {
          const c = Math.cos(p.rot);
          const sn = Math.sin(p.rot);
          ctx.moveTo(x - c * len, y - sn * len);
          ctx.lineTo(x + c * len, y + sn * len);
        }
        ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }

    // Flechas para naves fuera de la vista
    _offscreen(race, L) {
      const ctx = this.ctx;
      const order = race.standings();
      ctx.font = '700 12px ' + FONT;
      ctx.textBaseline = 'middle';
      for (const sh of race.ships) {
        const x = this.sx(sh.x, L);
        let side = 0;
        if (x < 6) side = -1;
        else if (x > this.w - 6) side = 1;
        if (!side) continue;
        const y = this.sy(race, sh.lane, 0, L);
        const place = order.indexOf(sh) + 1;
        const ref = place === 1 ? order[1] : order[0];
        const gap = Math.round(sh.x - ref.x);
        const ax = side < 0 ? 12 : this.w - 12;
        ctx.fillStyle = U.rgba(sh.rgb, 0.95);
        ctx.beginPath();
        ctx.moveTo(ax + side * 7, y);
        ctx.lineTo(ax - side * 6, y - 9);
        ctx.lineTo(ax - side * 6, y + 9);
        ctx.closePath();
        ctx.fill();
        ctx.textAlign = side < 0 ? 'left' : 'right';
        const txt = sh.short + ' ' + place + 'º ' + (gap >= 0 ? '+' : '−') + Math.abs(gap) + ' m';
        ctx.fillText(txt, ax - side * 12, y);
      }
    }

    _hud(race, L, view) {
      const ctx = this.ctx;
      const w = this.w;
      const h = this.h;

      // Temporizador
      const left = view.timeLeft;
      const fs = Math.max(16, Math.min(L.top * 0.6, h * 0.12, 64));
      const urgent = view.phase === 'race' && left <= 10;
      const frac = left - Math.floor(left);
      const sc = urgent ? 1 + 0.18 * frac : 1;
      ctx.save();
      ctx.translate(w / 2, L.top * 0.48);
      ctx.scale(sc, sc);
      ctx.font = '700 ' + fs + 'px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = urgent ? '#ffffff' : U.rgba(INK, 0.92);
      if (urgent) {
        ctx.shadowColor = 'rgba(255,255,255,0.8)';
        ctx.shadowBlur = 16 * this.dpr * frac;
      }
      ctx.fillText(U.formatTime(left), 0, 0);
      ctx.restore();

      // barra de progreso de la carrera junto al reloj
      const bw = Math.min(220, w * 0.22);
      const by = L.top * 0.48 + fs * 0.58;
      if (by < L.top - 4) {
        ctx.fillStyle = U.rgba(INK, 0.15);
        ctx.fillRect(w / 2 - bw / 2, by, bw, 2);
        ctx.fillStyle = U.rgba(INK, 0.8);
        ctx.fillRect(w / 2 - bw / 2, by, bw * U.clamp(race.time / C.RACE_TIME, 0, 1), 2);
      }

      this._minimap(race, L);

      const cx = w / 2;
      const cy = (L.top + L.bottom) / 2;
      if (view.phase === 'countdown') {
        const n = Math.max(1, Math.ceil(view.countdown));
        const f = view.countdown - Math.floor(view.countdown);
        const size = Math.min((L.bottom - L.top) * 0.75, 170);
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(0.75 + f * 0.45, 0.75 + f * 0.45);
        ctx.globalAlpha = 0.3 + 0.7 * f;
        ctx.strokeStyle = U.rgba(INK, 0.6);
        ctx.lineWidth = 3;
        ctx.rotate(-this.t * 0.6);
        hexPath(ctx, size * 0.72);
        ctx.stroke();
        ctx.rotate(this.t * 0.6);
        ctx.fillStyle = U.rgba(INK, 1);
        ctx.font = '700 ' + size + 'px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(n), 0, size * 0.05);
        ctx.restore();
        this._banner('ELIGE TU MODO: ACELERAR O DISPARAR', cx, L.bottom + (h - L.bottom) * 0.5, 13, 0.75);
      }
      if (view.goT > 0) {
        const a = U.clamp(view.goT / 0.9, 0, 1);
        const size = Math.min((L.bottom - L.top) * 0.6, 140);
        ctx.save();
        ctx.globalAlpha = a;
        ctx.translate(cx, cy);
        ctx.scale(1 + (1 - a) * 0.6, 1 + (1 - a) * 0.6);
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 ' + size + 'px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('¡YA!', 0, 0);
        ctx.restore();
      }
      if (view.phase === 'finish') {
        const size = Math.min((L.bottom - L.top) * 0.5, 120);
        ctx.save();
        ctx.fillStyle = 'rgba(5,6,26,0.45)';
        ctx.fillRect(0, cy - size * 0.75, w, size * 1.5);
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 ' + size + 'px ' + FONT;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('¡TIEMPO!', cx, cy);
        ctx.restore();
      }
    }

    _banner(text, x, y, size, alpha) {
      const ctx = this.ctx;
      ctx.save();
      ctx.font = '600 ' + size + 'px ' + FONT;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = U.rgba(INK, alpha);
      ctx.fillText(text, x, y);
      ctx.restore();
    }

    // Mini mapa de posiciones (debajo de la pista)
    _minimap(race, L) {
      const ctx = this.ctx;
      const w = this.w;
      const room = this.h - L.bottom;
      if (room < 22) return;
      const y = L.bottom + room * 0.55;
      const x0 = w * 0.18;
      const x1 = w * 0.82;
      let lo = Infinity;
      let hi = -Infinity;
      for (const s of race.ships) {
        lo = Math.min(lo, s.x);
        hi = Math.max(hi, s.x);
      }
      const range = Math.max(300, hi - lo);
      const base = hi - range;
      ctx.strokeStyle = U.rgba(INK, 0.22);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x1, y);
      ctx.stroke();
      ctx.fillStyle = U.rgba(INK, 0.45);
      ctx.font = '600 10px ' + FONT;
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'right';
      ctx.fillText('ÚLTIMO', x0 - 8, y);
      ctx.textAlign = 'left';
      ctx.fillText('LÍDER', x1 + 8, y);

      const ordered = race.ships.slice().sort((a, b) => (a.kind === 'human') - (b.kind === 'human'));
      for (const s of ordered) {
        const px = x0 + ((s.x - base) / range) * (x1 - x0);
        const human = s.kind === 'human';
        ctx.fillStyle = U.rgba(s.rgb, 1);
        ctx.beginPath();
        ctx.arc(px, y, human ? 5 : 3.5, 0, Math.PI * 2);
        ctx.fill();
        if (human && room > 34) {
          ctx.font = '700 10px ' + FONT;
          ctx.textAlign = 'center';
          ctx.textBaseline = s.player === 0 ? 'bottom' : 'top';
          ctx.fillText(s.short, px, s.player === 0 ? y - 7 : y + 7);
        }
      }
    }
  }

  OP.Renderer = Renderer;
})();
