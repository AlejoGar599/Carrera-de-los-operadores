/* ==========================================================
   Generador de operaciones
   - Tipo "resultado": operación completa, elegir 1 de 4 resultados.
   - Tipo "operador": la operación ya tiene resultado, falta el operador.
   La dificultad sube con cada respuesta correcta del jugador.
   ========================================================== */
(function () {
  'use strict';
  const OP = window.OP;
  const U = OP.U;

  const OPS = ['+', '-', '*', '/'];
  const SYMBOL = { '+': '+', '-': '−', '*': '×', '/': '÷' };

  // Aciertos necesarios para alcanzar cada nivel (0..5)
  const TIER_AT = [0, 3, 6, 10, 14, 19];

  // Operadores disponibles en cada nivel
  const TIER_OPS = [
    ['+', '-'],
    ['+', '-', '*'],
    OPS, OPS, OPS, OPS,
  ];

  function tierFor(correct) {
    let t = 0;
    for (let i = 0; i < TIER_AT.length; i++) if (correct >= TIER_AT[i]) t = i;
    return t;
  }

  function apply(a, op, b) {
    if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return b !== 0 && a % b === 0 ? a / b : NaN; // solo divisiones exactas
    }
    return NaN;
  }

  const isHigh = (op) => op === '*' || op === '/';

  /* Evalúa respetando la jerarquía de operaciones.
     nums: [a,b] o [a,b,c] · ops: [o1] o [o1,o2] · group: null | 'left' | 'right' (paréntesis) */
  function evaluate(nums, ops, group) {
    if (nums.length === 2) return apply(nums[0], ops[0], nums[1]);
    if (group === 'left') return apply(apply(nums[0], ops[0], nums[1]), ops[1], nums[2]);
    if (group === 'right') return apply(nums[0], ops[0], apply(nums[1], ops[1], nums[2]));
    if (isHigh(ops[1]) && !isHigh(ops[0])) {
      return apply(nums[0], ops[0], apply(nums[1], ops[1], nums[2]));
    }
    return apply(apply(nums[0], ops[0], nums[1]), ops[1], nums[2]);
  }

  // Par de números para una operación simple según el nivel
  function binary(op, tier, rng) {
    const R = U.randInt;
    let a, b;
    if (op === '+' || op === '-') {
      const ranges = [
        [1, 9, 1, 9],
        [4, 15, 2, 9],
        [10, 49, 3, 19],
        [20, 99, 10, 49],
        [20, 99, 10, 49],
        [40, 199, 15, 99],
      ];
      const r = ranges[tier];
      a = R(rng, r[0], r[1]);
      b = R(rng, r[2], r[3]);
      if (op === '+' && rng() < 0.5) { const t = a; a = b; b = t; }
      if (op === '-') {
        const negative = tier >= 5 && rng() < 0.3; // en el último nivel aparecen negativos
        if ((!negative && a < b) || (negative && a > b)) { const t = a; a = b; b = t; }
      }
    } else if (op === '*') {
      const ranges = [[1, 3, 1, 3], [2, 5, 2, 5], [2, 9, 2, 9], [3, 12, 3, 12], [3, 12, 3, 12], [11, 25, 3, 9]];
      const r = ranges[tier];
      a = R(rng, r[0], r[1]);
      b = R(rng, r[2], r[3]);
      if (rng() < 0.5) { const t = a; a = b; b = t; }
    } else {
      // división exacta: [divisor min, divisor max, cociente min, cociente max]
      const ranges = [[1, 3, 1, 3], [2, 5, 2, 5], [2, 9, 2, 9], [3, 12, 3, 12], [3, 12, 3, 12], [3, 9, 11, 25]];
      const r = ranges[tier];
      const d = R(rng, r[0], r[1]);
      const q = R(rng, r[2], r[3]);
      a = d * q;
      b = d;
    }
    return [a, b];
  }

  // Expresión de tres números (niveles 4 y 5): jerarquía y paréntesis
  function ternary(tier, rng) {
    const maxN = tier >= 5 ? 12 : 9;
    for (let i = 0; i < 400; i++) {
      const ops = [U.pick(rng, OPS), U.pick(rng, OPS)];
      let group = null;
      if (tier >= 5 && rng() < 0.45) group = rng() < 0.5 ? 'left' : 'right';
      // preferimos mezclar + − con × ÷ para practicar la jerarquía
      if (!group && !isHigh(ops[0]) && !isHigh(ops[1]) && rng() < 0.75) continue;
      const nums = [U.randInt(rng, 2, maxN), U.randInt(rng, 2, maxN), U.randInt(rng, 2, maxN)];
      const v = evaluate(nums, ops, group);
      if (!Number.isInteger(v)) continue;
      if (tier < 5 && v < 0) continue;
      if (Math.abs(v) > 160) continue;
      if (group && evaluate(nums, ops, null) === v) continue; // paréntesis que no cambian nada
      return { nums, ops, group, value: v };
    }
    return null;
  }

  const numTok = (n) => ({ k: 'num', v: U.fmt(n) });

  function tokensFor(expr, blankOp, showResult) {
    const t = [];
    const { nums, ops, group } = expr;
    const opTok = (i) => (blankOp === i ? { k: 'blank', v: '?' } : { k: 'op', v: SYMBOL[ops[i]] });
    if (nums.length === 2) {
      t.push(numTok(nums[0]), opTok(0), numTok(nums[1]));
    } else {
      if (group === 'left') t.push({ k: 'paren', v: '(' });
      t.push(numTok(nums[0]), opTok(0));
      if (group === 'right') t.push({ k: 'paren', v: '(' });
      t.push(numTok(nums[1]));
      if (group === 'left') t.push({ k: 'paren', v: ')' });
      t.push(opTok(1), numTok(nums[2]));
      if (group === 'right') t.push({ k: 'paren', v: ')' });
    }
    t.push({ k: 'eq', v: '=' });
    t.push(showResult ? numTok(expr.value) : { k: 'blank', v: '?' });
    return t;
  }

  // Tipo 1: elegir el resultado correcto entre 4 opciones
  function makeResultProblem(expr, tier, rng) {
    const v = expr.value;
    const ok = (x) => Number.isInteger(x) && x !== v && (tier >= 5 || x >= 0) && Math.abs(x) < 2000;
    const smart = [];
    const generic = [v + 1, v - 1, v + 2, v - 2, v + 3, v - 3];
    if (Math.abs(v) >= 15) generic.push(v + 10, v - 10);

    if (expr.nums.length === 3) {
      const [a, b, c] = expr.nums;
      const [o1, o2] = expr.ops;
      smart.push(apply(apply(a, o1, b), o2, c)); // error típico: operar de izquierda a derecha
      if (expr.group) smart.push(evaluate(expr.nums, expr.ops, null)); // ignorar paréntesis
      smart.push(evaluate(expr.nums, expr.ops, expr.group === 'left' ? 'right' : 'left'));
    } else {
      const [a, b] = expr.nums;
      const op = expr.ops[0];
      if (op === '+') smart.push(Math.abs(a - b));
      if (op === '-') smart.push(a + b);
      if (op === '*') smart.push(a * (b + 1), a * (b - 1), (a + 1) * b, a + b);
      if (op === '/') smart.push(a - b, v * 2, b);
      if (Math.abs(v) >= 15) smart.push(v + 10, v - 10);
    }

    const chosen = [];
    const addIf = (x) => {
      if (chosen.length < 3 && ok(x) && chosen.indexOf(x) === -1) chosen.push(x);
    };
    U.shuffle(smart.filter(ok), rng).slice(0, 2).forEach(addIf);
    U.shuffle(generic.filter(ok), rng).forEach(addIf);
    for (let k = 4; chosen.length < 3 && k < 50; k++) { addIf(v + k); addIf(v - k); }

    const options = U.shuffle([v].concat(chosen), rng);
    return {
      kind: 'result',
      tokens: tokensFor(expr, -1, false),
      options: options.map(U.fmt),
      correct: options.indexOf(v),
    };
  }

  // Tipo 2: falta el operador. Las opciones siempre son + − × ÷ en ese orden
  function makeOperatorProblem(expr, rng) {
    const blank = expr.ops.length === 1 ? 0 : U.randInt(rng, 0, expr.ops.length - 1);
    let matches = 0;
    for (let i = 0; i < OPS.length; i++) {
      const ops2 = expr.ops.slice();
      ops2[blank] = OPS[i];
      if (evaluate(expr.nums, ops2, expr.group) === expr.value) matches++;
    }
    if (matches !== 1) return null; // ambiguo (ej: 2 ? 2 = 4) → se descarta
    return {
      kind: 'operator',
      tokens: tokensFor(expr, blank, true),
      options: OPS.map((o) => SYMBOL[o]),
      correct: OPS.indexOf(expr.ops[blank]),
    };
  }

  function create(correctCount, rng, lastSig) {
    rng = rng || Math.random;
    const tier = tierFor(correctCount);
    for (let attempt = 0; attempt < 80; attempt++) {
      let expr = null;
      const useTernary = tier >= 4 && rng() < (tier >= 5 ? 0.6 : 0.5);
      if (useTernary) expr = ternary(tier, rng);
      if (!expr) {
        const op = U.pick(rng, TIER_OPS[tier]);
        const nums = binary(op, tier, rng);
        const v = apply(nums[0], op, nums[1]);
        if (!Number.isInteger(v)) continue;
        expr = { nums, ops: [op], group: null, value: v };
      }
      let p = rng() < 0.45 ? makeOperatorProblem(expr, rng) : null;
      if (!p) p = makeResultProblem(expr, tier, rng);
      p.sig = p.kind + ':' + p.tokens.map((t) => t.v).join('');
      if (p.sig === lastSig) continue;
      p.tier = tier;
      p.value = expr.value;
      return p;
    }
    // Respaldo (prácticamente imposible llegar aquí)
    const expr = { nums: [2, 3], ops: ['+'], group: null, value: 5 };
    const p = makeResultProblem(expr, 0, rng);
    p.sig = 'fallback';
    p.tier = tier;
    p.value = 5;
    return p;
  }

  OP.Problems = { create, tierFor, evaluate, apply, TIER_AT, SYMBOL, OPS };
})();
