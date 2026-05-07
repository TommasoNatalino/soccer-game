/* ══════════════════════════════════════════════════
   CALCIO ARENA — GAME ENGINE
   ══════════════════════════════════════════════════
   Controls:
     P1: WASD move | SPACE shoot/tackle | SHIFT sprint
     P2: Arrow keys | ENTER shoot/tackle | RSHIFT sprint
   ESC = pausa
   ══════════════════════════════════════════════════ */

const canvas = document.getElementById('field');
const ctx    = canvas.getContext('2d');
const W = canvas.width;   // 900
const H = canvas.height;  // 580

// ── FIELD DIMENSIONS ──
const FIELD = { x:40, y:50, w:820, h:480 };
const GOAL  = { w:14, h:120 };

// ── PHYSICS CONSTANTS ──
const FRICTION   = 0.985;
const BALL_FRIC  = 0.978;
const SPEED_NORM = 3.2;
const SPEED_SPTR = 5.4;
const KICK_POWER = 11;
const TACKLE_R   = 28;
const BALL_R     = 10;
const PLAYER_R   = 14;

// ── GAME STATE ──
let state = {
  mode: '1p', diff: 'easy',
  matchTime: 90, elapsed: 0,
  score: [0, 0],
  shots: [0, 0], passes: [0, 0],
  paused: false, over: false,
  lastGoal: null,
  kickoff: null
};

let players = [], ball = {}, particles = [], keys = {};

// ── DIFFICULTY CONFIG ──
const DIFF = {
  easy:   { react: 0.025, shootRange: 200, passProb: 0.008, tackleProb: 0.012 },
  medium: { react: 0.045, shootRange: 260, passProb: 0.015, tackleProb: 0.022 },
  hard:   { react: 0.075, shootRange: 340, passProb: 0.025, tackleProb: 0.040 }
};

// ── PLAYER CLASS ──
function createPlayer(id, team, x, y, role, isAI) {
  return {
    id, team, x, y, role, isAI,
    vx:0, vy:0,
    r: PLAYER_R,
    hasBall: false,
    sprint: false,
    sprintStamina: 100,
    kickCooldown: 0,
    tackleCooldown: 0,
    homeX: x, homeY: y,
    // stats
    totalDist: 0, kicked: 0
  };
}

function createBall(x, y) {
  return { x, y, vx:0, vy:0, r: BALL_R, owner: null };
}

// ── SETUP ──
function setupMatch() {
  const cx = FIELD.x + FIELD.w/2;
  const cy = FIELD.y + FIELD.h/2;

  // Team 0 (blue/home) — left side
  players = [
    createPlayer(0, 0, cx - 200, cy, 'GK', state.mode==='1p'),
    createPlayer(1, 0, cx - 300, cy - 100, 'DEF', state.mode==='1p'),
    createPlayer(2, 0, cx - 300, cy + 100, 'DEF', state.mode==='1p'),
    createPlayer(3, 0, cx - 180, cy,       'MID', state.mode==='1p'),
    createPlayer(4, 0, cx - 100, cy - 80,  'FWD', false),   // P1 main
    // Team 1 (red/away) — right side, always AI or P2
    createPlayer(5, 1, cx + 200, cy, 'GK', true),
    createPlayer(6, 1, cx + 300, cy - 100, 'DEF', true),
    createPlayer(7, 1, cx + 300, cy + 100, 'DEF', true),
    createPlayer(8, 1, cx + 180, cy,       'MID', true),
    createPlayer(9, 1, cx + 100, cy - 80,  'FWD', state.mode==='2p' ? false : true),
  ];

  // In 2P mode: P1 controls p4 (team0 FWD), P2 controls p9 (team1 FWD)
  // In 1P mode: P1 controls p4 (team0 FWD), rest of team0 is AI too
  if (state.mode === '1p') {
    players[4].isAI = false; // only p4 is human
  } else {
    players[4].isAI = false;
    players[9].isAI = false;
  }

  ball = createBall(cx, cy);
  ball.vx = (Math.random() > 0.5 ? 1 : -1) * 0.5;
}

function kickoff() {
  const cx = FIELD.x + FIELD.w/2;
  const cy = FIELD.y + FIELD.h/2;
  ball.x = cx; ball.y = cy;
  ball.vx = 0; ball.vy = 0; ball.owner = null;
  players.forEach(p => { p.x = p.homeX; p.y = p.homeY; p.vx = 0; p.vy = 0; p.hasBall = false; });
  state.kickoff = Date.now() + 1200;
}

// ── INPUT ──
window.addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Escape') togglePause();
  e.preventDefault();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

function togglePause() {
  if (state.over) return;
  state.paused = !state.paused;
  document.getElementById('pause-overlay').classList.toggle('hidden', !state.paused);
}
function resumeGame() { state.paused = false; document.getElementById('pause-overlay').classList.add('hidden'); }
function goMenu() { showScreen('menu'); cancelAnimationFrame(rafId); }
function restartGame() {
  state.score = [0,0]; state.elapsed = 0; state.over = false;
  state.shots = [0,0]; state.passes = [0,0];
  setupMatch(); kickoff(); showScreen('game');
  document.getElementById('score-home').textContent = '0';
  document.getElementById('score-away').textContent = '0';
}

// ── HUMAN PLAYER CONTROL ──
function controlHuman(p, isP2) {
  const up    = isP2 ? keys['ArrowUp']    : keys['KeyW'];
  const down  = isP2 ? keys['ArrowDown']  : keys['KeyS'];
  const left  = isP2 ? keys['ArrowLeft']  : keys['KeyA'];
  const right = isP2 ? keys['ArrowRight'] : keys['KeyD'];
  const shoot = isP2 ? keys['Enter']      : keys['Space'];
  const spr   = isP2 ? keys['ShiftRight'] : keys['ShiftLeft'];

  p.sprint = spr && p.sprintStamina > 5;
  const spd = p.sprint ? SPEED_SPTR : SPEED_NORM;
  if (up)    p.vy -= spd * 0.18;
  if (down)  p.vy += spd * 0.18;
  if (left)  p.vx -= spd * 0.18;
  if (right) p.vx += spd * 0.18;
  const mag = Math.hypot(p.vx, p.vy);
  if (mag > spd) { p.vx = p.vx/mag*spd; p.vy = p.vy/mag*spd; }

  // Shoot / tackle
  if (shoot && p.kickCooldown <= 0) {
    const dist = Math.hypot(ball.x - p.x, ball.y - p.y);
    if (dist < TACKLE_R + 5) {
      kickBall(p);
    } else {
      // Tackle nearby opponent
      players.forEach(opp => {
        if (opp.team !== p.team && Math.hypot(opp.x-p.x, opp.y-p.y) < TACKLE_R + 8) {
          tackle(p, opp);
        }
      });
    }
    p.kickCooldown = 25;
  }
}

// ── AI CONTROL ──
function controlAI(p) {
  const cfg  = DIFF[state.diff];
  const cx   = FIELD.x + FIELD.w/2;
  const ballDist = Math.hypot(ball.x - p.x, ball.y - p.y);
  const teamSign = p.team === 0 ? -1 : 1; // team0 attacks right, team1 attacks left
  const goalX = p.team === 0 ? FIELD.x + FIELD.w - GOAL.w : FIELD.x + GOAL.w;
  const oppGoalX = p.team === 0 ? FIELD.x + GOAL.w : FIELD.x + FIELD.w - GOAL.w;

  let tx = p.homeX, ty = p.homeY;

  if (ball.owner && ball.owner.team === p.team) {
    // Teammate has ball
    if (p.role === 'FWD') { tx = oppGoalX - teamSign*80; ty = ball.y + (p.id%2===0?-60:60); }
    else if (p.role === 'MID') { tx = p.homeX; ty = ball.y * 0.5 + p.homeY * 0.5; }
    else { tx = p.homeX; ty = p.homeY; }
  } else if (!ball.owner || ball.owner.team !== p.team) {
    // Chase ball if close
    if (p.role === 'FWD') { tx = ball.x; ty = ball.y; }
    else if (p.role === 'MID') {
      tx = ball.x * 0.6 + p.homeX * 0.4;
      ty = ball.y * 0.6 + p.homeY * 0.4;
    } else if (p.role === 'DEF') {
      tx = ball.x * 0.35 + p.homeX * 0.65;
      ty = ball.y * 0.4 + p.homeY * 0.6;
    } else { // GK
      tx = p.homeX;
      ty = Math.max(FIELD.y + 80, Math.min(FIELD.y + FIELD.h - 80, ball.y));
    }
  }

  // If has ball — shoot or move
  if (p.hasBall || ballDist < TACKLE_R) {
    // Shoot if in range
    if (ballDist < cfg.shootRange && p.kickCooldown <= 0) {
      if (Math.random() < cfg.shootProb || Math.random() < 0.02) {
        aiKick(p, goalX);
        state.shots[p.team]++;
      }
    }
    // Random pass
    if (Math.random() < cfg.passProb) {
      aiPass(p);
    }
  }

  // Tackle
  if (!p.hasBall && p.tackleCooldown <= 0) {
    players.forEach(opp => {
      if (opp.team !== p.team && Math.hypot(opp.x-p.x, opp.y-p.y) < TACKLE_R + 4) {
        if (Math.random() < cfg.tackleProb) tackle(p, opp);
      }
    });
  }

  // Move toward target
  const dx = tx - p.x, dy = ty - p.y;
  const d  = Math.hypot(dx, dy);
  if (d > 4) {
    const spd = SPEED_NORM * cfg.react * 30;
    p.vx += (dx/d) * spd * cfg.react;
    p.vy += (dy/d) * spd * cfg.react;
    const mag = Math.hypot(p.vx, p.vy);
    const maxSpd = p.role === 'GK' ? SPEED_NORM * 0.8 : SPEED_NORM;
    if (mag > maxSpd) { p.vx = p.vx/mag*maxSpd; p.vy = p.vy/mag*maxSpd; }
  }
}

function aiKick(p, goalX) {
  const goalY = FIELD.y + FIELD.h/2;
  const spread = (Math.random() - 0.5) * 100;
  const dx = goalX - ball.x, dy = goalY + spread - ball.y;
  const d  = Math.hypot(dx, dy);
  ball.vx = (dx/d) * (KICK_POWER * 0.85 + Math.random()*2);
  ball.vy = (dy/d) * (KICK_POWER * 0.85 + Math.random()*2);
  ball.owner = null; p.hasBall = false; p.kickCooldown = 30;
}

function aiPass(p) {
  // Find nearest teammate
  let best = null, bestScore = Infinity;
  players.forEach(t => {
    if (t.team === p.team && t !== p) {
      const d = Math.hypot(t.x - p.x, t.y - p.y);
      if (d < bestScore && d > 40) { best = t; bestScore = d; }
    }
  });
  if (best) {
    const dx = best.x - ball.x, dy = best.y - ball.y;
    const d  = Math.hypot(dx, dy);
    ball.vx = (dx/d) * (KICK_POWER * 0.55);
    ball.vy = (dy/d) * (KICK_POWER * 0.55);
    ball.owner = null; p.hasBall = false; p.kickCooldown = 30;
    state.passes[p.team]++;
  }
}

function kickBall(p) {
  // Kick toward opponent goal
  const goalX = p.team === 0 ? FIELD.x + FIELD.w - GOAL.w/2 : FIELD.x + GOAL.w/2;
  const goalY = FIELD.y + FIELD.h/2;
  let dx = goalX - ball.x, dy = goalY - ball.y;
  // Add human aim via movement direction
  if (Math.hypot(p.vx, p.vy) > 0.5) {
    dx += p.vx * 30; dy += p.vy * 30;
  }
  const d = Math.hypot(dx, dy);
  ball.vx = (dx/d) * KICK_POWER;
  ball.vy = (dy/d) * KICK_POWER;
  ball.owner = null; p.hasBall = false; p.kickCooldown = 20;
  state.shots[p.team]++;
  spawnParticles(ball.x, ball.y, '#fff', 8);
}

function tackle(attacker, defender) {
  const success = Math.random() < 0.55;
  if (success && defender.hasBall) {
    defender.hasBall = false; ball.owner = null;
    ball.vx += (attacker.x - defender.x) * 0.2;
    ball.vy += (attacker.y - defender.y) * 0.2;
    attacker.tackleCooldown = 35;
    spawnParticles(defender.x, defender.y, '#ff0', 6);
  }
}

// ── PHYSICS UPDATE ──
function updatePhysics(dt) {
  const inKickoff = state.kickoff && Date.now() < state.kickoff;

  // Players
  players.forEach(p => {
    if (state.mode === '2p' && p.id === 9) controlHuman(p, true);
    else if (!p.isAI) controlHuman(p, false);
    else if (!inKickoff) controlAI(p);

    // Sprint stamina
    if (p.sprint && p.sprintStamina > 0) p.sprintStamina -= 0.6;
    else if (!p.sprint && p.sprintStamina < 100) p.sprintStamina += 0.25;

    // Cooldowns
    if (p.kickCooldown > 0)   p.kickCooldown--;
    if (p.tackleCooldown > 0) p.tackleCooldown--;

    // Move
    p.x += p.vx; p.y += p.vy;
    p.vx *= 0.82; p.vy *= 0.82;
    p.totalDist += Math.hypot(p.vx, p.vy) * 0.001;

    // Field bounds
    p.x = Math.max(FIELD.x + p.r, Math.min(FIELD.x + FIELD.w - p.r, p.x));
    p.y = Math.max(FIELD.y + p.r, Math.min(FIELD.y + FIELD.h - p.r, p.y));

    // Player-player collision
    players.forEach(o => {
      if (o === p) return;
      const dx = o.x - p.x, dy = o.y - p.y;
      const dist = Math.hypot(dx, dy);
      const minD = p.r + o.r;
      if (dist < minD && dist > 0) {
        const nx = dx/dist, ny = dy/dist;
        const push = (minD - dist) * 0.5;
        p.x -= nx * push; p.y -= ny * push;
        o.x += nx * push; o.y += ny * push;
        const relVx = p.vx - o.vx, relVy = p.vy - o.vy;
        const dot = relVx*nx + relVy*ny;
        if (dot > 0) {
          p.vx -= dot*nx*0.5; p.vy -= dot*ny*0.5;
          o.vx += dot*nx*0.5; o.vy += dot*ny*0.5;
        }
      }
    });
  });

  // Ball
  ball.x += ball.vx; ball.y += ball.vy;
  ball.vx *= BALL_FRIC; ball.vy *= BALL_FRIC;

  // Ball-wall bounce
  if (ball.y - ball.r < FIELD.y) { ball.y = FIELD.y + ball.r; ball.vy *= -0.6; }
  if (ball.y + ball.r > FIELD.y + FIELD.h) { ball.y = FIELD.y + FIELD.h - ball.r; ball.vy *= -0.6; }

  // Ball-player collision
  let nearestP = null, nearestD = Infinity;
  players.forEach(p => {
    const dx = ball.x - p.x, dy = ball.y - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < ball.r + p.r) {
      const nx = dx/dist, ny = dy/dist;
      ball.x = p.x + nx*(ball.r + p.r);
      ball.y = p.y + ny*(ball.r + p.r);
      const dot = (ball.vx - p.vx)*nx + (ball.vy - p.vy)*ny;
      if (dot < 0) {
        ball.vx -= dot*nx*1.1; ball.vy -= dot*ny*1.1;
      }
    }
    if (dist < nearestD) { nearestD = dist; nearestP = p; }
  });

  // Ball ownership
  if (nearestD < TACKLE_R) {
    ball.owner = nearestP;
    nearestP.hasBall = true;
  } else {
    ball.owner = null;
    players.forEach(p => p.hasBall = p === nearestP && nearestD < TACKLE_R);
  }

  // Left/right boundary → goal check or line out
  const goalTop    = FIELD.y + FIELD.h/2 - GOAL.h/2;
  const goalBottom = FIELD.y + FIELD.h/2 + GOAL.h/2;
  const inGoalY    = ball.y > goalTop && ball.y < goalBottom;

  if (ball.x - ball.r < FIELD.x) {
    if (inGoalY) {
      scoreGoal(1);
    } else {
      ball.x = FIELD.x + ball.r; ball.vx *= -0.6;
    }
  }
  if (ball.x + ball.r > FIELD.x + FIELD.w) {
    if (inGoalY) {
      scoreGoal(0);
    } else {
      ball.x = FIELD.x + FIELD.w - ball.r; ball.vx *= -0.6;
    }
  }
}

// ── GOAL ──
function scoreGoal(team) {
  state.score[team]++;
  document.getElementById(team===0 ? 'score-home' : 'score-away').textContent = state.score[team];
  showBanner(team===0 ? '⚽ GOL! AZZURRI!' : '⚽ GOL! ROSSI!');
  spawnGoalParticles(team);
  setTimeout(kickoff, 2000);
}

function showBanner(text) {
  const b = document.getElementById('event-banner');
  b.textContent = text;
  b.classList.remove('hidden'); b.classList.add('show');
  setTimeout(() => { b.classList.remove('show'); b.classList.add('hidden'); }, 1800);
}

// ── PARTICLES ──
function spawnParticles(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd   = 1 + Math.random() * 4;
    particles.push({ x, y, vx: Math.cos(angle)*spd, vy: Math.sin(angle)*spd, life:1, color, size: 2+Math.random()*4 });
  }
}

function spawnGoalParticles(team) {
  const cx = FIELD.x + FIELD.w/2, cy = FIELD.y + FIELD.h/2;
  const colors = team===0 ? ['#6ab4ff','#fff','#ffd700'] : ['#ff7070','#fff','#ffd700'];
  for (let i = 0; i < 60; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd   = 2 + Math.random() * 7;
    const c     = colors[Math.floor(Math.random()*colors.length)];
    particles.push({ x: cx, y: cy, vx: Math.cos(angle)*spd, vy: Math.sin(angle)*spd, life:1, color:c, size:3+Math.random()*5 });
  }
}

function updateParticles() {
  particles = particles.filter(p => p.life > 0);
  particles.forEach(p => {
    p.x += p.vx; p.y += p.vy;
    p.vy += 0.12; // gravity
    p.life -= 0.025;
    p.vx *= 0.96; p.vy *= 0.96;
  });
}

// ── TIMER ──
function updateTimer(dt) {
  if (state.paused || state.over) return;
  state.elapsed += dt;
  const remaining = Math.max(0, state.matchTime - state.elapsed);
  const mins = Math.floor(remaining / 60);
  const secs = Math.floor(remaining % 60);
  document.getElementById('timer-display').textContent =
    String(mins).padStart(2,'0') + ':' + String(secs).padStart(2,'0');
  if (remaining <= 0) endMatch();
}

// ── END MATCH ──
function endMatch() {
  state.over = true;
  const [h, a] = state.score;
  const winner = h > a ? 'AZZURRI VINCONO! 🏆' : a > h ? 'ROSSI VINCONO! 🏆' : 'PAREGGIO! 🤝';
  const trophy = h > a ? '🏆' : a > h ? '🏆' : '🤝';
  document.getElementById('end-trophy').textContent = trophy;
  document.getElementById('end-title').textContent  = 'FISCHIO FINALE!';
  document.getElementById('end-score-big').textContent = `${h} — ${a}`;
  document.getElementById('end-winner').textContent  = winner;
  document.getElementById('end-stats').innerHTML =
    `<span>Tiri: <strong>${state.shots[0]}</strong> — <strong>${state.shots[1]}</strong></span>
     <span>Passaggi: <strong>${state.passes[0]}</strong> — <strong>${state.passes[1]}</strong></span>`;
  setTimeout(() => showScreen('end'), 1500);
}

// ── DRAW ──
function drawField() {
  // Background
  ctx.fillStyle = '#1a2a1a';
  ctx.fillRect(0, 0, W, H);

  // Grass stripes
  for (let i = 0; i < 10; i++) {
    ctx.fillStyle = i%2===0 ? '#1e3520' : '#1a2e1a';
    ctx.fillRect(FIELD.x + i*(FIELD.w/10), FIELD.y, FIELD.w/10, FIELD.h);
  }

  // Field border
  ctx.strokeStyle = 'rgba(255,255,255,0.5)';
  ctx.lineWidth = 2;
  ctx.strokeRect(FIELD.x, FIELD.y, FIELD.w, FIELD.h);

  // Center line
  ctx.beginPath();
  ctx.moveTo(FIELD.x + FIELD.w/2, FIELD.y);
  ctx.lineTo(FIELD.x + FIELD.w/2, FIELD.y + FIELD.h);
  ctx.stroke();

  // Center circle
  ctx.beginPath();
  ctx.arc(FIELD.x + FIELD.w/2, FIELD.y + FIELD.h/2, 65, 0, Math.PI*2);
  ctx.stroke();

  // Center dot
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.beginPath();
  ctx.arc(FIELD.x + FIELD.w/2, FIELD.y + FIELD.h/2, 4, 0, Math.PI*2);
  ctx.fill();

  // Penalty areas
  const paW = 130, paH = 250;
  ctx.strokeRect(FIELD.x, FIELD.y + (FIELD.h-paH)/2, paW, paH);
  ctx.strokeRect(FIELD.x + FIELD.w - paW, FIELD.y + (FIELD.h-paH)/2, paW, paH);

  // Goals
  ctx.fillStyle = 'rgba(255,255,255,0.1)';
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 2;
  const gy = FIELD.y + FIELD.h/2 - GOAL.h/2;
  // Left goal
  ctx.fillRect(FIELD.x - GOAL.w, gy, GOAL.w, GOAL.h);
  ctx.strokeRect(FIELD.x - GOAL.w, gy, GOAL.w, GOAL.h);
  // Right goal
  ctx.fillRect(FIELD.x + FIELD.w, gy, GOAL.w, GOAL.h);
  ctx.strokeRect(FIELD.x + FIELD.w, gy, GOAL.w, GOAL.h);

  // Corner arcs
  ctx.lineWidth = 1.5;
  [
    [FIELD.x, FIELD.y], [FIELD.x+FIELD.w, FIELD.y],
    [FIELD.x, FIELD.y+FIELD.h], [FIELD.x+FIELD.w, FIELD.y+FIELD.h]
  ].forEach(([cx,cy]) => {
    ctx.beginPath();
    ctx.arc(cx, cy, 14, 0, Math.PI*2);
    ctx.stroke();
  });
}

function drawPlayers() {
  players.forEach(p => {
    const isHuman = !p.isAI;
    const col = p.team === 0 ? (isHuman ? '#4af' : '#89c') : (isHuman ? '#f55' : '#c88');
    const shadow = p.team === 0 ? 'rgba(80,160,255,0.4)' : 'rgba(255,80,80,0.4)';

    // Shadow
    ctx.save();
    ctx.shadowColor = shadow;
    ctx.shadowBlur = 14;

    // Body
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
    ctx.fill();

    ctx.restore();

    // Rim
    ctx.strokeStyle = isHuman ? '#fff' : 'rgba(255,255,255,0.35)';
    ctx.lineWidth = isHuman ? 2.5 : 1.5;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI*2);
    ctx.stroke();

    // Jersey number
    ctx.fillStyle = '#fff';
    ctx.font = `bold 10px Rajdhani, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.id + 1, p.x, p.y);

    // Role badge
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.font = '8px Rajdhani, sans-serif';
    ctx.fillText(p.role, p.x, p.y - p.r - 6);

    // Sprint indicator
    if (p.sprint && p.sprintStamina > 10) {
      ctx.strokeStyle = '#ff0';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3,3]);
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r + 4, 0, Math.PI*2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Stamina bar (for human)
    if (isHuman) {
      const bw = 28, bh = 3;
      const bx = p.x - bw/2, by = p.y + p.r + 5;
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(bx, by, bw, bh);
      const pct = p.sprintStamina / 100;
      ctx.fillStyle = pct > 0.5 ? '#3ddc84' : pct > 0.25 ? '#f5c518' : '#e63946';
      ctx.fillRect(bx, by, bw * pct, bh);
    }
  });
}

function drawBall() {
  ctx.save();
  ctx.shadowColor = 'rgba(255,255,255,0.6)';
  ctx.shadowBlur = 12;

  // Ball body
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI*2);
  ctx.fill();

  // Ball patches
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(ball.x - 3, ball.y - 3, 3.5, 0, Math.PI*2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(ball.x + 4, ball.y + 2, 2.5, 0, Math.PI*2);
  ctx.fill();

  ctx.restore();
}

function drawParticles() {
  particles.forEach(p => {
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  });
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  drawField();
  drawParticles();
  drawPlayers();
  drawBall();
}

// ── GAME LOOP ──
let lastTime = 0, rafId;
function loop(ts) {
  const dt = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;
  if (!state.paused && !state.over) {
    updatePhysics(dt);
    updateParticles();
    updateTimer(dt);
  }
  draw();
  rafId = requestAnimationFrame(loop);
}

// ── SCREEN MANAGER ──
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('screen-' + name).classList.add('active');
}

// ── MENU SETUP ──
let selectedDiff = 'easy', selectedTime = 90;

document.querySelectorAll('.diff-btn').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.diff-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    selectedDiff = b.dataset.diff;
  });
});

document.querySelectorAll('.time-btn').forEach(b => {
  b.addEventListener('click', () => {
    document.querySelectorAll('.time-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    selectedTime = +b.dataset.time;
  });
});

document.getElementById('btn-1p').addEventListener('click', () => startGame('1p'));
document.getElementById('btn-2p').addEventListener('click', () => startGame('2p'));

function startGame(mode) {
  state.mode = mode;
  state.diff = selectedDiff;
  state.matchTime = selectedTime;
  state.score = [0, 0];
  state.elapsed = 0;
  state.over = false;
  state.shots = [0, 0];
  state.passes = [0, 0];
  document.getElementById('score-home').textContent = '0';
  document.getElementById('score-away').textContent = '0';
  document.getElementById('pause-overlay').classList.add('hidden');
  setupMatch();
  kickoff();
  showScreen('game');
  cancelAnimationFrame(rafId);
  lastTime = performance.now();
  rafId = requestAnimationFrame(loop);
  showBanner(mode === '2p' ? '2 GIOCATORI — VIA!' : 'VS CPU — VIA!');
}

// Add shoot prob to DIFF
DIFF.easy.shootProb   = 0.025;
DIFF.medium.shootProb = 0.045;
DIFF.hard.shootProb   = 0.075;

// Kick ball when player walks into it
function autoPickup() {
  players.forEach(p => {
    const d = Math.hypot(ball.x - p.x, ball.y - p.y);
    if (d < p.r + ball.r + 2 && ball.owner !== p) {
      // Soft follow
      ball.x = p.x + Math.cos(Math.atan2(ball.y-p.y, ball.x-p.x)) * (p.r + ball.r + 1);
      ball.y = p.y + Math.sin(Math.atan2(ball.y-p.y, ball.x-p.x)) * (p.r + ball.r + 1);
    }
  });
}

// ── START: show menu ──
showScreen('menu');
