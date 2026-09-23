const WORLD_WIDTH = 1680;
const ROUND_SECONDS = 120;
const TILT_LIMIT = 30;
const MAX_LEN = 92;
const MIN_LEN = MAX_LEN / 2;
const MAX_SWING = Math.PI / 2;
const FOOT_RADIUS = 28;
const SOURCE_X = 180;
const TOWN_X = 1480;
const GRAVITY = 1600;

export function createGame(canvas, hud) {
  const ctx = canvas.getContext("2d");
  const pointers = new Map();
  let running = false;
  let lastTime = 0;
  let width = 0;
  let height = 0;
  let dpr = 1;
  const state = resetState();

  function resetState() {
    const hip = {
      x: SOURCE_X,
      y: groundY(SOURCE_X) - MAX_LEN * Math.cos(0.32),
      vy: 0,
      vw: 0,
    };
    const next = {
      left: { angle: -0.32, len: MAX_LEN, x: 0, y: 0 },
      right: { angle: 0.32, len: MAX_LEN, x: 0, y: 0 },
      hip,
      water: 0,
      carrying: false,
      score: 0,
      timeLeft: ROUND_SECONDS,
      cameraX: 0,
      fillAnim: 0,
      deliveredFlash: 0,
      particles: [],
      hoverFoot: null,
      over: false,
    };
    placeFeet(next);
    return next;
  }

  function placeFeet(target = state) {
    for (const name of ["left", "right"]) {
      const leg = target[name];
      const len = Math.max(MIN_LEN, Math.min(MAX_LEN, leg.len));
      leg.len = len;
      leg.x = target.hip.x + Math.sin(leg.angle) * len;
      leg.y = target.hip.y + Math.cos(leg.angle) * len;
    }
  }

  function clampSwing(angle) {
    return Math.max(-MAX_SWING, Math.min(MAX_SWING, angle));
  }

  function clampLen(len) {
    return Math.max(MIN_LEN, Math.min(MAX_LEN, len));
  }

  function isPlanted(foot) {
    return foot.y >= groundY(foot.x) - 6;
  }

  function isGrabbed(name) {
    return [...pointers.values()].includes(name);
  }

  function groundY(x) {
    const h = height || 520;
    const nx = x / WORLD_WIDTH;
    const scale = h / 520;
    const hills =
      Math.sin(nx * Math.PI * 2.2) * 70 +
      Math.sin(nx * Math.PI * 5.1 + 0.6) * 42 +
      Math.sin(nx * Math.PI * 9.4 + 1.4) * 16;
    const beach = Math.max(0, 1 - nx * 8) * 30;
    const townRise = Math.max(0, (nx - 0.82) * 180);
    return h * 0.76 - (hills + beach - townRise) * scale;
  }

  function midPoint() {
    return {
      x: (state.left.x + state.right.x) / 2,
      y: (state.left.y + state.right.y) / 2,
    };
  }

  function tiltDegrees() {
    const mid = midPoint();
    const lean = Math.atan2(state.hip.x - mid.x, Math.max(12, mid.y - state.hip.y));
    return lean * (180 / Math.PI);
  }

  function worldFromEvent(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) * (width / rect.width)) + state.cameraX,
      y: (event.clientY - rect.top) * (height / rect.height),
      id: event.pointerId,
    };
  }

  function nearestFoot(x, y) {
    const candidates = [
      { name: "left", foot: state.left },
      { name: "right", foot: state.right },
    ];
    let best = null;
    let bestDist = FOOT_RADIUS + 14;
    for (const item of candidates) {
      const toFoot = Math.hypot(x - item.foot.x, y - item.foot.y);
      const toLeg = distToSegment(x, y, state.hip.x, state.hip.y, item.foot.x, item.foot.y);
      const dist = Math.min(toFoot, toLeg);
      if (dist < bestDist) {
        bestDist = dist;
        best = item.name;
      }
    }
    return best;
  }

  function distToSegment(px, py, ax, ay, bx, by) {
    const abx = bx - ax;
    const aby = by - ay;
    const len2 = abx * abx + aby * aby || 1;
    const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / len2));
    return Math.hypot(px - (ax + t * abx), py - (ay + t * aby));
  }

  function swingLeg(name, worldX, worldY) {
    const hip = state.hip;
    const foot = state[name];
    const planted = isPlanted(foot);
    const oldX = foot.x;
    const oldY = foot.y;
    const dx = worldX - hip.x;
    const dy = worldY - hip.y;
    foot.angle = clampSwing(Math.atan2(dx, dy));
    foot.len = clampLen(Math.hypot(dx, dy) || MIN_LEN);
    placeFeet();
    const lifting = foot.y < groundY(foot.x) - 3;

    if (planted && !lifting) {
      hip.x += oldX - foot.x;
      hip.y += oldY - foot.y;
      hip.x = Math.max(60, Math.min(WORLD_WIDTH - 60, hip.x));
      placeFeet();
    }
    resolveGround();
  }

  function resolveGround() {
    for (let i = 0; i < 8; i += 1) {
      placeFeet();
      let lift = 0;
      for (const foot of [state.left, state.right]) {
        lift = Math.max(lift, foot.y - groundY(foot.x));
      }
      if (lift <= 0) break;
      state.hip.y -= lift;
      state.hip.vy = 0;
    }
    placeFeet();
  }

  function rotateAroundPivot(name, dt) {
    const pivot = { x: state[name].x, y: state[name].y };
    const hip = state.hip;
    const rx = hip.x - pivot.x;
    const ry = hip.y - pivot.y;
    const dist = clampLen(Math.hypot(rx, ry) || MAX_LEN);
    const theta = Math.atan2(rx, -ry);
    hip.vw += (GRAVITY / dist) * Math.sin(theta) * dt;
    hip.vw *= Math.pow(0.88, dt * 60);
    const nextTheta = Math.max(-1.15, Math.min(1.15, theta + hip.vw * dt));
    if (Math.abs(nextTheta) >= 1.14) hip.vw *= 0.4;
    hip.x = pivot.x + Math.sin(nextTheta) * dist;
    hip.y = pivot.y - Math.cos(nextTheta) * dist;
    const leg = state[name];
    leg.len = dist;
    leg.angle = clampSwing(Math.atan2(pivot.x - hip.x, pivot.y - hip.y));
    placeFeet();
    hip.x += pivot.x - state[name].x;
    hip.y += pivot.y - state[name].y;
    hip.x = Math.max(60, Math.min(WORLD_WIDTH - 60, hip.x));
    placeFeet();
  }

  function droopAirborne(dt) {
    for (const name of ["left", "right"]) {
      if (isGrabbed(name) || isPlanted(state[name])) continue;
      const foot = state[name];
      foot.angle += -Math.sign(foot.angle || 0) * 4.6 * dt;
      if (Math.abs(foot.angle) < 0.05) foot.angle = 0;
      foot.len = Math.min(MAX_LEN, foot.len + 140 * dt);
    }
    placeFeet();
  }

  function updateBody(dt) {
    droopAirborne(dt);
    const leftPlant = isPlanted(state.left);
    const rightPlant = isPlanted(state.right);

    if (leftPlant && rightPlant) {
      state.hip.vy = 0;
      state.hip.vw = 0;
      resolveGround();
      return;
    }

    if (leftPlant !== rightPlant) {
      rotateAroundPivot(leftPlant ? "left" : "right", dt);
      state.hip.vy += GRAVITY * 0.6 * dt;
      state.hip.y += state.hip.vy * dt;
    } else {
      state.hip.vy += GRAVITY * dt;
      state.hip.y += state.hip.vy * dt;
    }
    resolveGround();
  }

  function fillAtSource(dt) {
    if (Math.abs(midPoint().x - SOURCE_X) < 90 && !state.carrying && state.water < 100) {
      state.water = Math.min(100, state.water + 280 * dt);
      if (state.water >= 99.5) {
        state.water = 100;
        state.carrying = true;
      }
    }
  }

  function deliverAtTown() {
    if (midPoint().x > TOWN_X - 90 && state.carrying && state.water > 0) {
      const gained = Math.round(state.water);
      state.score += gained;
      state.water = 0;
      state.carrying = false;
      state.deliveredFlash = 2.2;
    }
  }

  function spill(dt) {
    const tilt = Math.abs(tiltDegrees());
    if (tilt <= TILT_LIMIT || state.water <= 0 || !state.carrying) return;
    const extra = tilt - TILT_LIMIT;
    const loss = extra * 0.55 * dt;
    state.water = Math.max(0, state.water - loss);
    if (state.water <= 0) state.carrying = false;
    if (Math.random() < extra / 40) {
      const angle = (tiltDegrees() * Math.PI) / 180;
      state.particles.push({
        x: state.hip.x + 18,
        y: state.hip.y - 8,
        vx: Math.sin(angle) * 40,
        vy: 20 + Math.random() * 30,
        life: 0.7,
      });
    }
  }

  function updateParticles(dt) {
    state.particles = state.particles.filter((p) => {
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 90 * dt;
      return p.life > 0;
    });
    if (state.deliveredFlash > 0) state.deliveredFlash -= dt;
  }

  function syncHud() {
    hud.waterFill.style.height = `${state.water}%`;
    hud.timer.textContent = Math.max(0, Math.ceil(state.timeLeft));
    hud.score.textContent = Math.round(state.score);
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = Math.max(1, Math.floor(rect.width));
    height = Math.max(1, Math.floor(rect.height));
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function drawSky() {
    const sky = ctx.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, "#7ec8e3");
    sky.addColorStop(0.55, "#c9e4a4");
    sky.addColorStop(1, "#d7b07a");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = "#ffe27a";
    ctx.beginPath();
    ctx.arc(width * 0.78, 70, 38, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(255,255,255,0.85)";
    for (const cloud of [
      [180, 70],
      [520, 50],
      [900, 80],
    ]) {
      const x = cloud[0] - state.cameraX * 0.15;
      drawCloud(x, cloud[1]);
    }
  }

  function drawCloud(x, y) {
    ctx.beginPath();
    ctx.arc(x, y, 22, 0, Math.PI * 2);
    ctx.arc(x + 24, y - 8, 26, 0, Math.PI * 2);
    ctx.arc(x + 48, y, 20, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawTerrain() {
    ctx.beginPath();
    ctx.moveTo(-20, height + 20);
    for (let x = 0; x <= WORLD_WIDTH; x += 8) {
      ctx.lineTo(x - state.cameraX, groundY(x));
    }
    ctx.lineTo(WORLD_WIDTH + 20 - state.cameraX, height + 20);
    ctx.closePath();
    ctx.fillStyle = "#d7a06a";
    ctx.fill();
    ctx.fillStyle = "#c6864f";
    ctx.beginPath();
    ctx.moveTo(-20, height + 20);
    for (let x = 0; x <= WORLD_WIDTH; x += 8) {
      ctx.lineTo(x - state.cameraX, groundY(x) + 28);
    }
    ctx.lineTo(WORLD_WIDTH + 20 - state.cameraX, height + 20);
    ctx.closePath();
    ctx.fill();
  }

  function drawSource() {
    const x = SOURCE_X - state.cameraX;
    const y = groundY(SOURCE_X);
    ctx.fillStyle = "#3d8ec0";
    ctx.beginPath();
    ctx.ellipse(x - 70, y + 18, 92, 18, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#5aa8d6";
    ctx.beginPath();
    ctx.ellipse(x - 70, y + 12, 70, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#16303c";
    ctx.font = "700 13px Outfit, sans-serif";
    ctx.fillText("Water source", x - 110, y - 36);
  }

  function drawTown() {
    const x = TOWN_X - state.cameraX;
    const y = groundY(TOWN_X);
    const huts = [
      [-70, 34],
      [-20, 46],
      [28, 32],
    ];
    for (const [dx, h] of huts) {
      ctx.fillStyle = "#c58a4a";
      ctx.fillRect(x + dx, y - h, 36, h);
      ctx.fillStyle = "#7a3f24";
      ctx.beginPath();
      ctx.moveTo(x + dx - 8, y - h);
      ctx.lineTo(x + dx + 18, y - h - 18);
      ctx.lineTo(x + dx + 44, y - h);
      ctx.fill();
    }
    if (state.deliveredFlash > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, state.deliveredFlash);
      ctx.fillStyle = "#16303c";
      ctx.font = "700 20px Outfit, sans-serif";
      ctx.fillText("Water delivered", x - 80, y - 92);
      ctx.restore();
    }
  }

  function drawCharacter() {
    const { left, right, hip } = state;
    const ox = state.cameraX;
    const tilt = (tiltDegrees() * Math.PI) / 180;
    const mid = midPoint();

    ctx.save();
    ctx.strokeStyle = "rgba(22,48,60,0.35)";
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(hip.x - ox, hip.y - 70);
    ctx.lineTo(hip.x - ox, hip.y + 70);
    ctx.stroke();
    ctx.restore();

    const active = state.hoverFoot || [...pointers.values()][0];
    if (active) {
      ctx.save();
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = "rgba(255,194,14,0.28)";
      ctx.beginPath();
      ctx.arc(hip.x - ox, hip.y, MIN_LEN, Math.PI * 0.5, Math.PI * 1.5, true);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,194,14,0.5)";
      ctx.beginPath();
      ctx.arc(hip.x - ox, hip.y, MAX_LEN, Math.PI * 0.5, Math.PI * 1.5, true);
      ctx.stroke();
      ctx.restore();
    }

    const drawLeg = (foot, name) => {
      const grabbed = [...pointers.values()].includes(name);
      ctx.strokeStyle = grabbed ? "#111" : "#2b2b2b";
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(hip.x - ox, hip.y);
      ctx.lineTo(foot.x - ox, foot.y);
      ctx.stroke();
      ctx.fillStyle = grabbed || state.hoverFoot === name ? "#ffc20e" : "#222";
      ctx.beginPath();
      ctx.arc(foot.x - ox, foot.y, 11, 0, Math.PI * 2);
      ctx.fill();
    };
    drawLeg(left, "left");
    drawLeg(right, "right");

    ctx.save();
    ctx.translate(hip.x - ox, hip.y);
    ctx.rotate(tilt);
    ctx.fillStyle = "#1f4d63";
    ctx.fillRect(-11, -18, 22, 36);
    ctx.fillStyle = "#f1c27d";
    ctx.beginPath();
    ctx.arc(0, -30, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffc20e";
    ctx.fillRect(10, -8, 16, 22);
    ctx.fillStyle = "#1f6f9a";
    const waterH = 18 * (state.water / 100);
    ctx.fillRect(12, 12 - waterH, 12, waterH);
    ctx.restore();

    if (Math.abs(tiltDegrees()) > TILT_LIMIT && state.carrying) {
      ctx.fillStyle = "#b42318";
      ctx.font = "700 12px Outfit, sans-serif";
      ctx.fillText("Spilling!", mid.x - ox - 24, hip.y - 58);
    }
  }

  function draw() {
    if (!width) resize();
    ctx.clearRect(0, 0, width, height);
    drawSky();
    drawTerrain();
    drawSource();
    drawTown();
    drawCharacter();
    for (const p of state.particles) {
      ctx.globalAlpha = Math.max(0, p.life);
      ctx.fillStyle = "#4db3e8";
      ctx.beginPath();
      ctx.arc(p.x - state.cameraX, p.y, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function loop(now) {
    if (!running) return;
    const dt = Math.min(0.05, (now - lastTime) / 1000 || 0.016);
    lastTime = now;
    if (!state.over) {
      state.timeLeft -= dt;
      if (state.timeLeft <= 0) {
        state.timeLeft = 0;
        state.over = true;
        running = false;
        hud.onGameOver(Math.round(state.score));
      }
      updateBody(dt);
      fillAtSource(dt);
      deliverAtTown();
      spill(dt);
      updateParticles(dt);
      const view = width || canvas.clientWidth;
      state.cameraX = Math.max(0, Math.min(WORLD_WIDTH - view, state.hip.x - view * 0.35));
      syncHud();
    }
    draw();
    if (running) requestAnimationFrame(loop);
  }

  function onPointerDown(event) {
    if (!running || state.over) return;
    const point = worldFromEvent(event);
    const foot = nearestFoot(point.x, point.y);
    if (foot) pointers.set(event.pointerId, foot);
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch {
      /* synthetic or unsupported capture */
    }
  }

  function onPointerMove(event) {
    const point = worldFromEvent(event);
    state.hoverFoot = nearestFoot(point.x, point.y);
    const foot = pointers.get(event.pointerId);
    if (!foot || !running) return;
    swingLeg(foot, point.x, point.y);
  }

  function onPointerUp(event) {
    pointers.delete(event.pointerId);
    if (![...pointers.values()].length) state.hoverFoot = null;
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  window.addEventListener("resize", () => {
    resize();
    draw();
  });

  return {
    start() {
      running = true;
      lastTime = performance.now();
      resize();
      Object.assign(state, resetState());
      pointers.clear();
      hud.root.hidden = false;
      syncHud();
      requestAnimationFrame(loop);
    },
    replay() {
      this.start();
    },
    drawIdle() {
      resize();
      draw();
    },
  };
}
