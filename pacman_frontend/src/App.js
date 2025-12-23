import React, { useEffect, useMemo, useRef, useState } from 'react';
import './App.css';

/**
 * PUBLIC_INTERFACE
 * Main Pacman App component rendering the game with UI and Ocean Professional styling.
 * - Renders topbar (score, lives, level)
 * - Hosts canvas renderer with 60fps game loop
 * - Provides keyboard and on-screen controls, pause and game over modals
 * - Supports env-based configuration via REACT_APP_* variables
 */
function App() {
  const [theme, setTheme] = useState('light');

  // Configuration via env
  const config = useMemo(() => ({
    TILE: 24,
    COLS: 28,
    ROWS: 31,
    FPS: 60,
    INITIAL_LIVES: 3,
    POWER_DURATION_MS: 6000,
    GHOST_SPEED: 0.9,
    PACMAN_SPEED: 1.1,
    LOG_LEVEL: (process.env.REACT_APP_LOG_LEVEL || 'info'),
  }), []);

  // Game state
  const [score, setScore] = useState(0);
  const [level, setLevel] = useState(1);
  const [lives, setLives] = useState(config.INITIAL_LIVES);
  const [paused, setPaused] = useState(false);
  const [gameOver, setGameOver] = useState(false);

  // Canvas refs
  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const loopRef = useRef({ last: 0, acc: 0 });
  const gameRef = useRef(null);

  // Audio (simple tones using WebAudio to avoid binary assets)
  const audioRef = useRef(null);
  useEffect(() => {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    audioRef.current = ctx;
  }, []);

  // THEME
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  const toggleTheme = () => setTheme(t => (t === 'light' ? 'dark' : 'light'));

  // Simple PRNG for ghost decisions
  const rng = () => Math.random();

  // Maze definition (compact: 0 empty, 1 wall, 2 pellet, 3 power)
  const baseMaze = useMemo(() => {
    // Simple classic-like outline; ensure paths around center and corners
    // 28x31 matrix
    const W = 1, E = 0, P = 2, O = 3;
    const rows = [];
    const top = Array(28).fill(W);
    rows.push(top.slice());
    for (let r = 1; r < 30; r++) {
      const row = Array(28).fill(W);
      for (let c = 1; c < 27; c++) {
        row[c] = P;
      }
      // carve borders
      row[1] = P; row[26] = P;
      // center tunnel
      if (r === 14) { row[0] = E; row[27] = E; row[13] = E; row[14] = E; row[12] = P; row[15] = P; }
      // ghost home box
      if (r >= 12 && r <= 18 && cBetween(10, 17)) {
        // inside home box empty
        for (let c = 11; c <= 16; c++) row[c] = E;
        row[13] = E; row[14] = E;
      }
      rows.push(row);
    }
    rows.push(top.slice());

    // Power pellets in corners
    rows[1][1] = O;
    rows[1][26] = O;
    rows[29][1] = O;
    rows[29][26] = O;

    // carve walls outline stronger by setting walls back where necessary
    // Add some inner walls to give shape
    for (let c = 3; c < 25; c++) { rows[3][c] = W; rows[27][c] = W; }
    for (let r = 3; r < 28; r++) { rows[r][3] = W; rows[r][24] = W; }
    // open door to ghost home
    rows[12][13] = W; rows[12][14] = W;
    rows[13][13] = E; rows[13][14] = E;
    rows[14][13] = E; rows[14][14] = E;
    rows[15][13] = E; rows[15][14] = E;

    // ensure pellets on paths not walls
    for (let r = 0; r < 31; r++) for (let c = 0; c < 28; c++) {
      if (rows[r][c] !== W && rows[r][c] !== O) rows[r][c] = rows[r][c] || P;
    }
    return rows;

    function cBetween(a,b){ return true; }
  }, []);

  // Game world instance
  useEffect(() => {
    const TILE = config.TILE;
    const maze = baseMaze.map(r => r.slice());

    const world = createWorld({
      maze,
      tile: TILE,
      onScore: (delta) => setScore(s => s + delta),
      onLifeLost: () => {
        setLives(l => {
          const next = l - 1;
          if (next <= 0) {
            setGameOver(true);
            setPaused(true);
          }
          return next;
        });
      },
      onClear: () => {
        // Next level
        setLevel(lv => lv + 1);
        // respawn pellets
        for (let r = 0; r < maze.length; r++) {
          for (let c = 0; c < maze[0].length; c++) {
            if (maze[r][c] === 0) maze[r][c] = 2;
          }
        }
      },
      audio: audioRef,
      config
    });
    gameRef.current = world;

    const handleKey = (e) => {
      const key = e.key.toLowerCase();
      if (key === 'p') { setPaused(p => !p); return; }
      if (key === ' ') { if (gameOver) restart(); return; }
      world?.input(key);
    };
    window.addEventListener('keydown', handleKey);

    return () => {
      window.removeEventListener('keydown', handleKey);
      cancelAnimationFrame(rafRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Game loop
  useEffect(() => {
    const fps = config.FPS;
    const step = 1000 / fps;
    loopRef.current.last = performance.now();
    loopRef.current.acc = 0;

    const frame = (now) => {
      const world = gameRef.current;
      if (!world) { rafRef.current = requestAnimationFrame(frame); return; }

      const dt = now - loopRef.current.last;
      loopRef.current.last = now;
      loopRef.current.acc += dt;

      while (loopRef.current.acc >= step) {
        if (!paused && !gameOver) world.update(step / 1000);
        loopRef.current.acc -= step;
      }
      // render
      const ctx = canvasRef.current?.getContext('2d');
      if (ctx) world.render(ctx, canvasRef.current);

      rafRef.current = requestAnimationFrame(frame);
    };
    rafRef.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [config.FPS, paused, gameOver]);

  const restart = () => {
    setScore(0);
    setLevel(1);
    setLives(config.INITIAL_LIVES);
    setGameOver(false);
    setPaused(false);
    // rebuild world
    const maze = baseMaze.map(r => r.slice());
    gameRef.current = createWorld({
      maze,
      tile: config.TILE,
      onScore: (delta) => setScore(s => s + delta),
      onLifeLost: () => {
        setLives(l => {
          const next = l - 1;
          if (next <= 0) {
            setGameOver(true);
            setPaused(true);
          }
          return next;
        });
      },
      onClear: () => setLevel(lv => lv + 1),
      audio: audioRef,
      config
    });
  };

  return (
    <div className="App">
      <div className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <span className="dot" />
            <span>Ocean Pacman</span>
          </div>
          <div className="score">
            <div className="item">Score <span className="value">{score}</span></div>
            <div className="item">Level <span className="value">{level}</span></div>
            <div className="item lives">Lives
              <span style={{ marginLeft: 8 }} />
              {Array.from({ length: lives }).map((_, i) => <span key={i} className="life" />)}
            </div>
          </div>
          <div className="controls">
            <button className="btn" onClick={() => setPaused(p => !p)} aria-label="Pause/Resume">
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button className="btn btn-amber" onClick={restart} aria-label="Restart">Restart</button>
            <button className="btn" onClick={toggleTheme} aria-label="Toggle theme">
              {theme === 'light' ? 'Dark' : 'Light'}
            </button>
          </div>
        </div>
      </div>

      <main className="main">
        <div className="stage">
          <aside className="panel">
            <h3>Controls</h3>
            <div className="hints">
              • Arrow keys or WASD to move.<br/>
              • P to pause. Space to restart when game over.<br/>
              • Mobile: use on-screen pad.
            </div>
            <div style={{ height: 14 }} />
            <DPad onDir={(d) => gameRef.current?.input(d)} />
          </aside>

          <section className="canvas-wrap">
            <canvas
              className="canvas"
              ref={canvasRef}
              width={config.COLS * config.TILE}
              height={config.ROWS * config.TILE}
              role="img"
              aria-label="Pacman game canvas"
            />
          </section>

          <aside className="panel">
            <h3>About</h3>
            <p className="hints">
              Built with React and Canvas, running a 60fps fixed timestep loop. Theme: Ocean Professional.
            </p>
          </aside>
        </div>
      </main>

      {(paused || gameOver) && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <h2>{gameOver ? 'Game Over' : 'Paused'}</h2>
            <p>{gameOver ? 'Press Restart to play again.' : 'Take a breath—ghosts are waiting.'}</p>
            <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
              {!gameOver && <button className="btn" onClick={() => setPaused(false)}>Resume</button>}
              <button className="btn btn-amber" onClick={restart}>Restart</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * PUBLIC_INTERFACE
 * Simple on-screen D-Pad for mobile users. Calls onDir with 'arrowup'|'arrowleft'|'arrowdown'|'arrowright'.
 */
function DPad({ onDir }) {
  const btn = (label, dir, style) => (
    <button
      key={dir}
      className="btn"
      style={{ minWidth: 64, minHeight: 44, ...style }}
      onClick={() => onDir(dir)}>{label}</button>
  );
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '64px 64px 64px', gap: 8 }}>
      <div />
      {btn('▲', 'arrowup')}
      <div />
      {btn('◀', 'arrowleft')}
      {btn('▼', 'arrowdown')}
      {btn('▶', 'arrowright')}
    </div>
  );
}

/**
 * PUBLIC_INTERFACE
 * World/engine factory encapsulating state update and drawing.
 */
function createWorld({ maze, tile, onScore, onLifeLost, onClear, audio, config }) {
  const cols = maze[0].length, rows = maze.length;

  const state = {
    maze,
    pellets: countPellets(maze),
    powerTimer: 0,
    ghosts: [],
    pacman: {
      x: 14, y: 23, dir: 'left', nx: 'left', speed: config.PACMAN_SPEED, alive: true
    }
  };

  state.ghosts = [
    ghost('blinky', 13, 14, 'left', 1.0, '#ff0000'),
    ghost('pinky', 14, 14, 'right', 0.95, '#ffb8ff'),
    ghost('inky', 12, 14, 'up', 0.95, '#00ffff'),
    ghost('clyde', 15, 14, 'down', 0.9, '#ffb852'),
  ];

  function cellAt(x, y) {
    const cx = wrap(Math.floor(x), cols);
    const cy = wrap(Math.floor(y), rows);
    return maze[cy][cx];
  }
  function passable(x, y) { return cellAt(x, y) !== 1; }
  function wrap(v, max) {
    if (v < 0) return max + v;
    if (v >= max) return v - max;
    return v;
  }
  function dirVec(d) {
    return d === 'left' ? [-1,0] : d === 'right' ? [1,0] : d === 'up' ? [0,-1] : [0,1];
  }
  function centerCoord(v) { return Math.round(v * 100) / 100; }

  function input(key) {
    if (key === 'arrowleft' || key === 'a') state.pacman.nx = 'left';
    if (key === 'arrowright' || key === 'd') state.pacman.nx = 'right';
    if (key === 'arrowup' || key === 'w') state.pacman.nx = 'up';
    if (key === 'arrowdown' || key === 's') state.pacman.nx = 'down';
  }

  function update(dt) {
    // Pacman movement with tile-center turning
    const p = state.pacman;
    const [dx, dy] = dirVec(p.dir);
    const speed = p.speed * dt * 6; // normalize velocity
    const gridX = Math.floor(p.x);
    const gridY = Math.floor(p.y);
    const centerX = gridX + 0.5;
    const centerY = gridY + 0.5;

    // If at tile center, allow turning if next dir is free
    const nearCenter = Math.abs(p.x - centerX) < 0.12 && Math.abs(p.y - centerY) < 0.12;
    if (nearCenter) {
      const [ndx, ndy] = dirVec(p.nx);
      if (passable(gridX + ndx, gridY + ndy)) {
        p.dir = p.nx;
      }
    }
    // Move
    const [vx, vy] = dirVec(p.dir);
    const nx = p.x + vx * speed;
    const ny = p.y + vy * speed;

    const tryCell = [Math.floor(nx), Math.floor(ny)];
    if (passable(tryCell[0], tryCell[1])) {
      p.x = wrap(nx, cols);
      p.y = wrap(ny, rows);
    } else {
      // snap to center on collision
      p.x = centerCoord(centerX);
      p.y = centerCoord(centerY);
    }

    // Pellet consumption
    const cx = Math.floor(p.x);
    const cy = Math.floor(p.y);
    const cell = maze[cy][cx];
    if (cell === 2) {
      maze[cy][cx] = 0;
      state.pellets -= 1;
      onScore(10);
      blip(audio, 880, 0.04);
      if (state.pellets <= 0) {
        onClear();
      }
    } else if (cell === 3) {
      maze[cy][cx] = 0;
      state.powerTimer = config.POWER_DURATION_MS;
      onScore(50);
      blip(audio, 220, 0.08);
    }

    // Ghost AI (scatter/chase/frightened simplified)
    const frightened = state.powerTimer > 0;
    state.powerTimer = Math.max(0, state.powerTimer - dt * 1000);

    state.ghosts.forEach((g, idx) => {
      const gz = dirVec(g.dir);
      const gSpeed = (config.GHOST_SPEED * (frightened ? 0.7 : 1.0)) * dt * 6;

      // when near center, choose new direction
      const gx = Math.floor(g.x), gy = Math.floor(g.y);
      const gcx = gx + 0.5, gcy = gy + 0.5;
      const gNearCenter = Math.abs(g.x - gcx) < 0.12 && Math.abs(g.y - gcy) < 0.12;
      if (gNearCenter) {
        const choices = ['left','right','up','down'].filter(d => {
          const [dx,dy] = dirVec(d);
          // prevent reversing unless dead end
          const opposite = (d === 'left' && g.dir === 'right') ||
                           (d === 'right' && g.dir === 'left') ||
                           (d === 'up' && g.dir === 'down') ||
                           (d === 'down' && g.dir === 'up');
          if (opposite) return false;
          return passable(gx + dx, gy + dy);
        });
        if (choices.length === 0) {
          // allow reverse
          const all = ['left','right','up','down'].filter(d => passable(gx + dirVec(d)[0], gy + dirVec(d)[1]));
          g.dir = all[Math.floor(Math.random()*all.length)] || g.dir;
        } else {
          if (frightened) {
            // random
            g.dir = choices[Math.floor(Math.random()*choices.length)];
          } else {
            // chase simple: move closer to Pacman
            const best = choices.reduce((best, d) => {
              const [dx,dy] = dirVec(d);
              const nx = gx + dx, ny = gy + dy;
              const dist = (nx - p.x)**2 + (ny - p.y)**2;
              if (!best || dist < best.dist) return { d, dist };
              return best;
            }, null);
            g.dir = best?.d || g.dir;
          }
        }
      }

      g.x = wrap(g.x + dirVec(g.dir)[0] * gSpeed, cols);
      g.y = wrap(g.y + dirVec(g.dir)[1] * gSpeed, rows);

      // collisions
      const hit = Math.hypot(g.x - p.x, g.y - p.y) < 0.6;
      if (hit) {
        if (frightened) {
          // eat ghost, send to home
          onScore(200);
          blip(audio, 180, 0.1);
          g.x = 13; g.y = 14; g.dir = 'left';
        } else {
          // pacman loses life and resets to start
          onLifeLost();
          p.x = 14; p.y = 23; p.dir = 'left'; p.nx = 'left';
          state.ghosts.forEach((gg,i) => { gg.x = 13 + (i%2); gg.y = 14 + (i>1?1:0); gg.dir = 'left'; });
        }
      }
    });
  }

  function render(ctx, canvas) {
    const TILE = tile;
    // clear
    ctx.fillStyle = '#000010';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // draw maze walls
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (maze[r][c] === 1) {
          ctx.fillStyle = '#0a1e7a';
          ctx.fillRect(c*TILE, r*TILE, TILE, TILE);
          // glowing edges
          ctx.strokeStyle = 'rgba(27,77,216,0.8)';
          ctx.lineWidth = 2;
          ctx.strokeRect(c*TILE+1, r*TILE+1, TILE-2, TILE-2);
        }
      }
    }

    // pellets
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (maze[r][c] === 2) {
        ctx.fillStyle = '#fef3c7';
        ctx.beginPath();
        ctx.arc(c*TILE + TILE/2, r*TILE + TILE/2, 2, 0, Math.PI*2);
        ctx.fill();
      }
      if (maze[r][c] === 3) {
        ctx.fillStyle = '#fde68a';
        ctx.beginPath();
        ctx.arc(c*TILE + TILE/2, r*TILE + TILE/2, 5, 0, Math.PI*2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(245,158,11,0.5)';
        ctx.beginPath();
        ctx.arc(c*TILE + TILE/2, r*TILE + TILE/2, 8, 0, Math.PI*2);
        ctx.stroke();
      }
    }

    // Pacman
    const p = state.pacman;
    drawPac(ctx, p.x*TILE, p.y*TILE, TILE, p.dir);

    // Ghosts
    state.ghosts.forEach(g => drawGhost(ctx, g.x*TILE, g.y*TILE, TILE, g.color, state.powerTimer > 0));
  }

  return { update, render, input };
}

function ghost(name, x, y, dir, speed, color) {
  return { name, x, y, dir, speed, color };
}

function countPellets(maze) {
  let n = 0;
  for (let r = 0; r < maze.length; r++)
    for (let c = 0; c < maze[0].length; c++)
      if (maze[r][c] === 2) n++;
  return n;
}

function drawPac(ctx, x, y, TILE, dir) {
  const r = TILE*0.38;
  const cx = x + TILE/2;
  const cy = y + TILE/2;
  const t = performance.now()/120;
  const open = (Math.sin(t)+1)/2 * 0.35 + 0.2; // animate mouth
  let a1 = 0, a2 = 0;
  if (dir === 'right') { a1 = open; a2 = -open; }
  if (dir === 'left')  { a1 = Math.PI - open; a2 = Math.PI + open; }
  if (dir === 'up')    { a1 = -Math.PI/2 + open; a2 = -Math.PI/2 - open; }
  if (dir === 'down')  { a1 = Math.PI/2 - open; a2 = Math.PI/2 + open; }
  ctx.fillStyle = '#ffde00';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, r, a1, a2, false);
  ctx.closePath();
  ctx.fill();
}

function drawGhost(ctx, x, y, TILE, color, frightened) {
  const cx = x + TILE/2;
  const cy = y + TILE/2 + 2;
  const w = TILE*0.75;
  const h = TILE*0.8;
  const r = TILE*0.28;
  ctx.fillStyle = frightened ? '#3b82f6' : color;
  ctx.beginPath();
  ctx.arc(cx, cy - h/4, r, Math.PI, 0);
  ctx.lineTo(cx + r, cy + h/3);
  // skirt
  const steps = 4;
  for (let i = steps; i >= 0; i--) {
    const ox = cx - r + (i * (2*r/steps));
    const oy = cy + h/3 + (i % 2 === 0 ? 4 : 0);
    ctx.lineTo(ox, oy);
  }
  ctx.closePath();
  ctx.fill();

  // eyes
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(cx - 6, cy - 6, 4, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 6, cy - 6, 4, 0, Math.PI*2); ctx.fill();
  ctx.fillStyle = frightened ? '#1e3a8a' : '#111827';
  ctx.beginPath(); ctx.arc(cx - 6, cy - 6, 2, 0, Math.PI*2); ctx.fill();
  ctx.beginPath(); ctx.arc(cx + 6, cy - 6, 2, 0, Math.PI*2); ctx.fill();
}

function blip(audioRef, freq, dur) {
  const ctx = audioRef.current;
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = 'square';
  o.frequency.value = freq;
  g.gain.value = 0.05;
  o.connect(g); g.connect(ctx.destination);
  const now = ctx.currentTime;
  o.start(now);
  o.stop(now + dur);
}

export default App;
