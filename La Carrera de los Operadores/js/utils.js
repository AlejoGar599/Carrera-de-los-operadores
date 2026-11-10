/* Utilidades generales: azar con semilla, interpolación, colores */
(function () {
  'use strict';
  const OP = window.OP;

  // Generador pseudoaleatorio con semilla (mulberry32)
  function makeRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const U = {
    makeRng,
    clamp: (v, a, b) => (v < a ? a : v > b ? b : v),
    lerp: (a, b, t) => a + (b - a) * t,
    randInt: (rng, a, b) => a + Math.floor(rng() * (b - a + 1)),
    randRange: (rng, a, b) => a + rng() * (b - a),
    pick: (rng, arr) => arr[Math.floor(rng() * arr.length)],
    shuffle(arr, rng) {
      const r = rng || Math.random;
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(r() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
      }
      return arr;
    },
    easeOutCubic: (t) => 1 - Math.pow(1 - t, 3),
    easeInOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    mixRGB(a, b, t) {
      return [
        Math.round(a[0] + (b[0] - a[0]) * t),
        Math.round(a[1] + (b[1] - a[1]) * t),
        Math.round(a[2] + (b[2] - a[2]) * t),
      ];
    },
    rgba(c, a) {
      return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')';
    },
    // Formato de números con signo menos tipográfico
    fmt(n) {
      return n < 0 ? '−' + Math.abs(n) : String(n);
    },
    formatTime(s) {
      const t = Math.max(0, Math.ceil(s));
      const m = Math.floor(t / 60);
      const r = t % 60;
      return m + ':' + (r < 10 ? '0' : '') + r;
    },
  };

  OP.U = U;
})();
