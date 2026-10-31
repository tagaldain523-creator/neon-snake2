(() => {
  'use strict';

  /* ---------- Config ---------- */
  const GRID = 20;                 // cells per side
  const BASE_INTERVAL = 140;       // ms per move at start
  const MIN_INTERVAL = 62;         // fastest speed
  const SPEED_STEP = 4;            // ms faster per food eaten
  const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
  const KEYS = {
    ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down',
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right'
  };

  /* ---------- DOM ---------- */
  const $ = id => document.getElementById(id);
  const cv = $('cv'), ctx = cv.getContext('2d');
  const board = $('board'), overlay = $('overlay');
  const scoreEl = $('score'), bestEl = $('best'), speedEl = $('speedLabel');
  const pauseBtn = $('pauseBtn');

  /* ---------- State ---------- */
  let snake, prev, dir, queue, food, score, foods, interval, acc, last;
  let state = 'ready';             // ready | running | paused | over
  let particles = [];
  let cell = 20;                   // pixel size of a grid cell (updated on resize)

  // High score persistence (wrapped: storage can be blocked in some viewers)
  let best = 0;
  try { best = parseInt(localStorage.getItem('neonSnakeBest'), 10) || 0; } catch (e) {}
  bestEl.textContent = best;

  /* ---------- Setup / reset ---------- */
  function reset() {
    const mid = Math.floor(GRID / 2);
    snake = [{ x: mid, y: mid }, { x: mid - 1, y: mid }, { x: mid - 2, y: mid }];
    prev = snake.map(s => ({ ...s }));
    dir = 'right';
    queue = [];
    score = 0; foods = 0;
    interval = BASE_INTERVAL; acc = 0;
    particles = [];
    placeFood();
    updateHud();
  }

  function placeFood() {
    // Choose uniformly among free cells so we never loop forever on a near-full board
    const free = [];
    for (let x = 0; x < GRID; x++)
      for (let y = 0; y < GRID; y++)
        if (!snake.some(s => s.x === x && s.y === y)) free.push({ x, y });
    food = free.length ? free[Math.floor(Math.random() * free.length)] : null;
  }

  function updateHud() {
    scoreEl.textContent = score;
    bestEl.textContent = best;
    speedEl.textContent = 'SPEED ' + (1 + foods);
  }

  /* ---------- Input ---------- */
  function turn(d) {
    if (state === 'ready') { start(); }
    if (state !== 'running') return;
    // Compare against the last queued direction so quick double-taps cannot reverse the snake
    const ref = queue.length ? queue[queue.length - 1] : dir;
    const [rx, ry] = DIRS[ref], [nx, ny] = DIRS[d];
    if (rx + nx === 0 && ry + ny === 0) return;  // opposite or same axis reversal
    if (d === ref) return;
    if (queue.length < 2) queue.push(d);
  }

  addEventListener('keydown', e => {
    if (KEYS[e.code]) { e.preventDefault(); turn(KEYS[e.code]); }
    else if (e.code === 'Space' || e.code === 'KeyP') { e.preventDefault(); togglePause(); }
    else if (e.code === 'Enter' && (state === 'over' || state === 'ready')) start();
  });

  document.querySelectorAll('.dpad button').forEach(b => {
    b.addEventListener('pointerdown', e => { e.preventDefault(); turn(b.dataset.d); });
  });

  // Swipe gestures on the board
  let touch = null;
  board.addEventListener('touchstart', e => {
    const t = e.changedTouches[0]; touch = { x: t.clientX, y: t.clientY };
  }, { passive: true });
  board.addEventListener('touchmove', e => {
    if (!touch) return;
    const t = e.changedTouches[0], dx = t.clientX - touch.x, dy = t.clientY - touch.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) > 22) {       // swipe threshold
      turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up'));
      touch = { x: t.clientX, y: t.clientY };              // allow chained swipes
    }
  }, { passive: true });
  board.addEventListener('touchend', () => { touch = null; });

  $('ovBtn').addEventListener('click', () => { if (state === 'paused') togglePause(); else start(); });
  pauseBtn.addEventListener('click', togglePause);
  document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'running') togglePause(); });

  /* ---------- Game flow ---------- */
  function showOverlay(title, text, final, btn) {
    $('ovTitle').textContent = title;
    $('ovText').textContent = text;
    $('ovFinal').textContent = final;
    $('ovBtn').textContent = btn;
    overlay.classList.remove('hidden');
  }

  function start() {
    reset();
    state = 'running';
    overlay.classList.add('hidden');
    pauseBtn.textContent = 'PAUSE';
    last = performance.now();
  }

  function togglePause() {
    if (state === 'running') {
      state = 'paused';
      pauseBtn.textContent = 'RESUME';
      showOverlay('PAUSED', 'Take a breath, runner.', '', 'RESUME');
    } else if (state === 'paused') {
      state = 'running';
      pauseBtn.textContent = 'PAUSE';
      overlay.classList.add('hidden');
      last = performance.now();
    }
  }

  function gameOver() {
    state = 'over';
    if (score > best) {
      best = score;
      try { localStorage.setItem('neonSnakeBest', best); } catch (e) {}
    }
    updateHud();
    board.classList.remove('shake'); void board.offsetWidth; board.classList.add('shake');
    showOverlay('GAME OVER', score && score >= best ? 'New high score!' : 'Signal lost.', 'FINAL SCORE: ' + score, 'RESTART');
    pauseBtn.textContent = 'PAUSE';
  }

  /* ---------- One logic step ---------- */
  function step() {
    if (queue.length) dir = queue.shift();
    const [dx, dy] = DIRS[dir];
    const head = { x: snake[0].x + dx, y: snake[0].y + dy };
    const eating = food && head.x === food.x && head.y === food.y;

    // Wall collision
    if (head.x < 0 || head.y < 0 || head.x >= GRID || head.y >= GRID) return gameOver();
    // Self collision (the tail cell is free this turn unless we are growing)
    const body = eating ? snake : snake.slice(0, -1);
    if (body.some(s => s.x === head.x && s.y === head.y)) return gameOver();

    prev = snake.map(s => ({ ...s }));    // keep old positions for smooth interpolation
    snake.unshift(head);

    if (eating) {
      score += 10; foods++;
      interval = Math.max(MIN_INTERVAL, BASE_INTERVAL - foods * SPEED_STEP);
      burst(food.x, food.y);
      placeFood();
      updateHud();
    } else {
      snake.pop();
    }
  }

  /* ---------- Particles ---------- */
  function burst(gx, gy) {
    for (let i = 0; i < 14; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 3;
      particles.push({ x: (gx + .5) * cell, y: (gy + .5) * cell, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1 });
    }
  }

  /* ---------- Rendering ---------- */
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = board.clientWidth;
    cv.width = cv.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cell = size / GRID;
  }
  addEventListener('resize', resize);

  // Linear interpolation helper
  const lerp = (a, b, t) => a + (b - a) * t;

  function render(t) {
    const W = cell * GRID;
    ctx.clearRect(0, 0, W, W);

    // Grid lines
    ctx.strokeStyle = 'rgba(0,240,255,.07)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < GRID; i++) {
      ctx.moveTo(i * cell, 0); ctx.lineTo(i * cell, W);
      ctx.moveTo(0, i * cell); ctx.lineTo(W, i * cell);
    }
    ctx.stroke();

    // Food: pulsing glowing orb
    if (food) {
      const pulse = 0.8 + 0.2 * Math.sin(performance.now() / 160);
      const fx = (food.x + .5) * cell, fy = (food.y + .5) * cell;
      ctx.save();
      ctx.shadowColor = '#ff2bd6'; ctx.shadowBlur = cell * 1.1 * pulse;
      ctx.fillStyle = '#ff5de4';
      ctx.beginPath(); ctx.arc(fx, fy, cell * .32 * pulse + cell * .08, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath(); ctx.arc(fx, fy, cell * .1, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // Snake: interpolate each segment between its previous and current cell
    const pts = snake.map((s, i) => {
      const p = prev[i] || prev[prev.length - 1];   // a newly grown tail starts at the old tail
      return { x: (lerp(p.x, s.x, t) + .5) * cell, y: (lerp(p.y, s.y, t) + .5) * cell };
    });

    ctx.save();
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = cell * .72;
    for (let i = pts.length - 1; i > 0; i--) {          // draw tail first so the head sits on top
      const k = i / pts.length;                          // 0 = head, 1 = tail
      const hue = lerp(185, 290, k);                     // cyan -> violet
      ctx.strokeStyle = `hsl(${hue} 100% ${lerp(58, 45, k)}%)`;
      ctx.shadowColor = `hsl(${hue} 100% 55%)`; ctx.shadowBlur = cell * .8;
      ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[i - 1].x, pts[i - 1].y); ctx.stroke();
    }
    // Head with eyes
    const h = pts[0], [dx, dy] = DIRS[dir];
    ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = cell * 1.1;
    ctx.fillStyle = '#7ffaff';
    ctx.beginPath(); ctx.arc(h.x, h.y, cell * .4, 0, Math.PI * 2); ctx.fill();
    ctx.shadowBlur = 0; ctx.fillStyle = '#07040f';
    const px = -dy, py = dx;                              // perpendicular for eye offset
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(h.x + dx * cell * .12 + px * s * cell * .17, h.y + dy * cell * .12 + py * s * cell * .17, cell * .08, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Particles
    for (const p of particles) {
      p.x += p.vx; p.y += p.vy; p.life -= .035;
      ctx.globalAlpha = Math.max(p.life, 0);
      ctx.fillStyle = '#ff5de4';
      ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    }
    ctx.globalAlpha = 1;
    particles = particles.filter(p => p.life > 0);
  }

  /* ---------- Main loop (fixed logic step, interpolated render) ---------- */
  function frame(now) {
    if (state === 'running') {
      acc += Math.min(now - last, 100);   // clamp so tab switches do not cause jumps
      last = now;
      while (acc >= interval && state === 'running') { acc -= interval; step(); }
    }
    render(state === 'running' ? acc / interval : (state === 'over' ? 1 : (acc / interval) || 1));
    requestAnimationFrame(frame);
  }

  /* ---------- Boot ---------- */
  reset();
  resize();
  showOverlay('NEON SNAKE', 'Eat the glowing orbs. Avoid walls and your own tail.', '', 'START');
  requestAnimationFrame(frame);
})();
