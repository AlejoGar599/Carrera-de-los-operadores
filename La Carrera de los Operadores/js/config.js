/* ==========================================================
   La Carrera de los Operadores — configuración general
   Cambia aquí tiempos, velocidades, teclas y colores.
   ========================================================== */
(function () {
  'use strict';
  const OP = (window.OP = window.OP || {});

  OP.CONFIG = {
    RACE_TIME: 60,            // duración de la carrera (s)
    COUNTDOWN: 3,             // cuenta regresiva (s)

    // --- Movimiento (1 unidad del mundo = 1 metro) ---
    BASE_SPEED: 140,          // velocidad normal, igual para todos (m/s)
    RECOVER_ACCEL: 220,       // aceleración para volver a la velocidad normal (m/s²)
    DASH_BOOST: 600,          // velocidad extra al inicio del impulso (m/s)
    DASH_TIME: 0.6,           // duración del impulso (s), decae linealmente
    DASH_MAX_STACK: 1.5,      // tope de impulsos acumulados (x DASH_BOOST)

    // --- Penalizaciones ---
    STALL_TIME: 1.0,          // ACELERAR + error: nave detenida (s)
    SHOOT_COOLDOWN: 2.2,      // DISPARAR + error: armas bloqueadas (s)
    // Choque con asteroide según tamaño (s): la nave se detiene y el panel
    // queda bloqueado ese tiempo. Chocar debe costar más que destruirlo.
    CRASH_STALL: [0, 1.4, 2.0, 2.6],
    NEXT_PROBLEM_DELAY: 0.22, // pausa breve tras un acierto (s)

    // --- Pista y asteroides ---
    LANE_H: 92,               // alto de cada carril (m)
    VIEW_MIN_W: 1500,         // ancho mínimo visible de la pista (m)
    TRACK_FILL: 0.7,          // fracción del alto superior que ocupa la pista
    SHIP_LEN: 50,
    SHIP_W: 30,
    FIRST_ASTEROID: 950,      // distancia del primer asteroide (m)
    ASTEROID_GAP: [720, 1150],// separación entre asteroides (m)
    ASTEROID_RADIUS: [0, 20, 28, 37],
    ASTEROID_ENTER_DIST: 1050,// a esta distancia el asteroide se atraviesa en el carril
    ASTEROID_ENTER_TIME: 1.1, // duración de la entrada al carril (s)
    SHOT_RANGE: 1400,         // alcance máximo para fijar un objetivo (m)
    SHOT_SPEED: 1150,

    // --- Rivales IA (intervalo medio entre respuestas y precisión) ---
    BOT_LEVELS: [
      null,
      { name: 'Fácil', interval: 3.3, accuracy: 0.66 },
      { name: 'Normal', interval: 2.6, accuracy: 0.76 },
      { name: 'Difícil', interval: 1.9, accuracy: 0.86 },
    ],
  };

  /* Controles. Se usan códigos físicos (event.code), así funcionan
     igual en teclado latinoamericano, español o inglés.
     Orden de opciones: 0 = arriba, 1 = izquierda, 2 = abajo, 3 = derecha */
  OP.CONTROLS = [
    {
      name: 'Jugador 1',
      short: 'J1',
      options: [['KeyW'], ['KeyA'], ['KeyS'], ['KeyD']],
      optionLabels: ['W', 'A', 'S', 'D'],
      modes: { accel: ['KeyQ'], shoot: ['KeyE'] },
      modeLabels: { accel: 'Q', shoot: 'E' },
    },
    {
      name: 'Jugador 2',
      short: 'J2',
      options: [['ArrowUp'], ['ArrowLeft'], ['ArrowDown'], ['ArrowRight']],
      optionLabels: ['↑', '←', '↓', '→'],
      modes: { accel: ['Enter', 'NumpadEnter'], shoot: ['ShiftRight'] },
      modeLabels: { accel: 'Enter', shoot: 'Shift der.' },
    },
  ];

  OP.COLORS = {
    bgStart: [7, 14, 54],     // azul profundo
    bgEnd: [33, 9, 58],       // morado oscuro
    ink: '#ece8ff',
    inkRGB: [236, 232, 255],
    players: ['#ff3d5e', '#37b6ff'],
    playersRGB: [[255, 61, 94], [55, 182, 255]],
    bot: '#bdb6e0',
    botRGB: [189, 182, 224],
    asteroid: '#d8d0ff',
  };
})();
