const canvas = document.getElementById("gameCanvas");
const gl = canvas.getContext("webgl");
const scoreEl = document.getElementById("score");
const bestScoreEl = document.getElementById("bestScore");
const playerNameEl = document.getElementById("playerName");
const loginButton = document.getElementById("loginButton");
const submitScoreButton = document.getElementById("submitScore");
const leaderboardList = document.getElementById("leaderboardList");
const muteButton = document.getElementById("muteButton");
const languageToggle = document.getElementById("languageToggle");
const fullscreenButton = document.getElementById("fullscreenButton");
const startOverlay = document.getElementById("startOverlay");
const statusHint = document.getElementById("statusHint");
const controlsHint = document.getElementById("controlsHint");
const tagline = document.getElementById("tagline");
const subtitle = document.getElementById("subtitle");
const startTitle = document.getElementById("startTitle");
const startSubtitle = document.getElementById("startSubtitle");
const leaderboardTitle = document.getElementById("leaderboardTitle");
const rankingHint = document.getElementById("rankingHint");
const rankingHint2 = document.getElementById("rankingHint2");
const touchHint = document.getElementById("touchHint");

const state = {
  playerName: "Visitante",
  score: 0,
  bestScore: 0,
  running: false,
  muted: false,
  language: "pt",
  ship: {
    x: 0,
    y: -0.75,
    width: 0.14,
    height: 0.18,
    speed: 0.02,
  },
  bullets: [],
  asteroids: [],
  particles: [],
  stars: [],
  lastShot: 0,
  spawnTimer: 0,
  lastFrame: performance.now(),
  audioContext: null,
  lastShotSound: 0,
  countryCode: "",
  usingGlobalRanking: false,
  dragging: false,
  pointerId: null,
};

const translations = {
  pt: {
    language: "PT-BR",
    tagline: "Retro shooter",
    subtitle: "Destrua asteroides infinitamente, marque pontos e suba no ranking global.",
    startTitle: "Toque ou clique para começar",
    startSubtitle: "Auto-fire ativo",
    controlsHint: "A nave atira automaticamente. Use mouse, toque ou setas do teclado para se mover.",
    touchHint: "Arraste o dedo na tela para mover a nave.",
    leaderboardTitle: "Ranking Global",
    submitScore: "Enviar pontuação",
    login: "Login com Google",
    muteOn: "Som: Ligado",
    muteOff: "Som: Mutado",
    fullscreen: "Tela cheia",
    exitFullscreen: "Sair da tela cheia",
    statusLocal: "Ranking local ativo. Configure Supabase para ranking global.",
    statusGlobal: "Ranking global ativo.",
    rankingHint:
      "Ranking global requer configurar Supabase. Sem isso, o ranking fica salvo localmente no navegador.",
    rankingHint2:
      "Para ativar o ranking global, preencha data-supabase-url e data-supabase-key no <body>.",
  },
  en: {
    language: "EN",
    tagline: "Retro shooter",
    subtitle: "Destroy endless asteroids, score points, and climb the global leaderboard.",
    startTitle: "Tap or click to start",
    startSubtitle: "Auto-fire enabled",
    controlsHint: "The ship fires automatically. Move with mouse, touch, or arrow keys.",
    touchHint: "Drag your finger on the screen to move the ship.",
    leaderboardTitle: "Global Leaderboard",
    submitScore: "Submit score",
    login: "Sign in with Google",
    muteOn: "Sound: On",
    muteOff: "Sound: Muted",
    fullscreen: "Fullscreen",
    exitFullscreen: "Exit fullscreen",
    statusLocal: "Local leaderboard active. Configure Supabase for global rankings.",
    statusGlobal: "Global leaderboard active.",
    rankingHint:
      "Global leaderboard requires Supabase setup. Without it, scores are stored locally in the browser.",
    rankingHint2:
      "To enable global ranking, fill data-supabase-url and data-supabase-key on the <body> tag.",
  },
};

const shaderSource = {
  vertex: `
    attribute vec2 a_position;
    attribute vec3 a_color;
    varying vec3 v_color;
    void main() {
      gl_Position = vec4(a_position, 0.0, 1.0);
      v_color = a_color;
    }
  `,
  fragment: `
    precision mediump float;
    varying vec3 v_color;
    void main() {
      gl_FragColor = vec4(v_color, 1.0);
    }
  `,
};

const program = createProgram(shaderSource.vertex, shaderSource.fragment);
const positionBuffer = gl.createBuffer();
const colorBuffer = gl.createBuffer();
const positionLocation = gl.getAttribLocation(program, "a_position");
const colorLocation = gl.getAttribLocation(program, "a_color");

const keys = new Set();

function createProgram(vertexSource, fragmentSource) {
  const vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
  const shaderProgram = gl.createProgram();
  gl.attachShader(shaderProgram, vertexShader);
  gl.attachShader(shaderProgram, fragmentShader);
  gl.linkProgram(shaderProgram);
  if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
    throw new Error(`Shader link error: ${gl.getProgramInfoLog(shaderProgram)}`);
  }
  return shaderProgram;
}

function compileShader(type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    throw new Error(`Shader compile error: ${gl.getShaderInfoLog(shader)}`);
  }
  return shader;
}

function resizeCanvas() {
  const ratio = window.devicePixelRatio || 1;
  const width = canvas.clientWidth * ratio;
  const height = canvas.clientHeight * ratio;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  gl.viewport(0, 0, canvas.width, canvas.height);
}

function randomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function resetGame() {
  state.score = 0;
  state.bullets = [];
  state.asteroids = [];
  state.particles = [];
  state.spawnTimer = 0;
  state.lastShot = 0;
  state.ship.x = 0;
  state.ship.y = -0.75;
}

function addBullet() {
  state.bullets.push({
    x: state.ship.x,
    y: state.ship.y + state.ship.height / 2,
    width: 0.02,
    height: 0.07,
    speed: 0.05,
  });
  playShotSound();
}

function addAsteroid() {
  const size = randomBetween(0.08, 0.16);
  state.asteroids.push({
    x: randomBetween(-0.85, 0.85),
    y: 1.1,
    radius: size / 2,
    width: size,
    height: size,
    speed: randomBetween(0.006, 0.014),
    spin: randomBetween(-0.03, 0.03),
    rotation: randomBetween(0, Math.PI * 2),
  });
}

function addExplosion(x, y) {
  for (let i = 0; i < 16; i += 1) {
    const angle = randomBetween(0, Math.PI * 2);
    const speed = randomBetween(0.01, 0.03);
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: randomBetween(20, 40),
      size: randomBetween(0.01, 0.02),
    });
  }
  playExplosionSound();
}

function initStars() {
  state.stars = Array.from({ length: 120 }, () => ({
    x: randomBetween(-1, 1),
    y: randomBetween(-1, 1),
    speed: randomBetween(0.001, 0.004),
    size: randomBetween(0.004, 0.012),
  }));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function updateStars(delta) {
  state.stars.forEach((star) => {
    star.y -= star.speed * delta;
    if (star.y < -1.2) {
      star.y = 1.2;
      star.x = randomBetween(-1, 1);
    }
  });
}

function updateGame(delta) {
  const moveX =
    (keys.has("ArrowLeft") || keys.has("a") ? -1 : 0) +
    (keys.has("ArrowRight") || keys.has("d") ? 1 : 0);

  state.ship.x = clamp(state.ship.x + moveX * state.ship.speed * delta, -0.9, 0.9);

  state.lastShot += delta;
  if (state.lastShot > 10) {
    addBullet();
    state.lastShot = 0;
  }

  state.spawnTimer += delta;
  if (state.spawnTimer > 32) {
    addAsteroid();
    state.spawnTimer = randomBetween(10, 26);
  }

  state.bullets.forEach((bullet) => {
    bullet.y += bullet.speed * delta;
  });
  state.bullets = state.bullets.filter((bullet) => bullet.y < 1.2);

  state.asteroids.forEach((asteroid) => {
    asteroid.y -= asteroid.speed * delta;
    asteroid.rotation += asteroid.spin * delta;
  });

  state.particles.forEach((particle) => {
    particle.x += particle.vx * delta;
    particle.y += particle.vy * delta;
    particle.life -= delta;
  });
  state.particles = state.particles.filter((particle) => particle.life > 0);

  const remainingAsteroids = [];
  state.asteroids.forEach((asteroid) => {
    let destroyed = false;
    state.bullets.forEach((bullet) => {
      if (isColliding(asteroid, bullet)) {
        destroyed = true;
        bullet.y = 2;
        state.score += 10;
        addExplosion(asteroid.x, asteroid.y);
      }
    });
    if (!destroyed) {
      remainingAsteroids.push(asteroid);
    }
  });
  state.asteroids = remainingAsteroids;

  const shipHit = state.asteroids.some((asteroid) => isColliding(asteroid, state.ship));
  if (shipHit) {
    state.bestScore = Math.max(state.bestScore, state.score);
    bestScoreEl.textContent = state.bestScore;
    resetGame();
    pauseGame();
  }

  updateHUD();
}

function isColliding(a, b) {
  return (
    Math.abs(a.x - b.x) < (a.width + b.width) / 2 &&
    Math.abs(a.y - b.y) < (a.height + b.height) / 2
  );
}

function updateHUD() {
  scoreEl.textContent = state.score.toString();
  bestScoreEl.textContent = state.bestScore.toString();
}

function draw() {
  gl.clearColor(0.02, 0.04, 0.08, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(program);
  gl.enableVertexAttribArray(positionLocation);
  gl.enableVertexAttribArray(colorLocation);

  drawStars();
  drawShip();
  state.bullets.forEach((bullet) => drawRect(bullet, [0.9, 0.9, 0.2]));
  state.asteroids.forEach((asteroid) => drawCircle(asteroid, [0.75, 0.45, 0.5]));
  state.particles.forEach((particle) =>
    drawRect(
      {
        x: particle.x,
        y: particle.y,
        width: particle.size,
        height: particle.size,
      },
      [1.0, 0.6, 0.2]
    )
  );
}

function drawStars() {
  state.stars.forEach((star) => {
    drawRect(
      {
        x: star.x,
        y: star.y,
        width: star.size,
        height: star.size * 1.6,
      },
      [0.4, 0.6, 1.0]
    );
  });
}

function drawShip() {
  const { x, y, width, height } = state.ship;
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const positions = new Float32Array([
    x,
    y + halfHeight,
    x - halfWidth,
    y - halfHeight,
    x + halfWidth,
    y - halfHeight,
  ]);

  const colors = new Float32Array([
    0.3, 0.9, 1.0,
    0.1, 0.4, 0.9,
    0.1, 0.4, 0.9,
  ]);

  drawShape(positions, colors);
}

function drawRect(entity, color) {
  const x = entity.x;
  const y = entity.y;
  const halfWidth = entity.width / 2;
  const halfHeight = entity.height / 2;

  const positions = new Float32Array([
    x - halfWidth,
    y - halfHeight,
    x + halfWidth,
    y - halfHeight,
    x - halfWidth,
    y + halfHeight,
    x - halfWidth,
    y + halfHeight,
    x + halfWidth,
    y - halfHeight,
    x + halfWidth,
    y + halfHeight,
  ]);

  const colors = new Float32Array([
    ...color,
    ...color,
    ...color,
    ...color,
    ...color,
    ...color,
  ]);

  drawShape(positions, colors);
}

function drawCircle(entity, color) {
  const segments = 18;
  const positions = [];
  const colors = [];
  const { x, y, radius } = entity;
  for (let i = 0; i < segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
    const nextAngle = ((i + 1) / segments) * Math.PI * 2;
    positions.push(
      x,
      y,
      x + Math.cos(angle) * radius,
      y + Math.sin(angle) * radius,
      x + Math.cos(nextAngle) * radius,
      y + Math.sin(nextAngle) * radius
    );
    colors.push(...color, ...color, ...color);
  }
  drawShape(new Float32Array(positions), new Float32Array(colors));
}

function drawShape(positions, colors) {
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
  gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);

  gl.drawArrays(gl.TRIANGLES, 0, positions.length / 2);
}

function gameLoop(now) {
  const delta = (now - state.lastFrame) / 16;
  state.lastFrame = now;
  resizeCanvas();
  updateStars(delta);
  if (state.running) {
    updateGame(delta);
  }
  draw();
  requestAnimationFrame(gameLoop);
}

function loadLeaderboard() {
  const saved = JSON.parse(localStorage.getItem("spaceboom_leaderboard") || "[]");
  return Array.isArray(saved) ? saved : [];
}

function saveLeaderboard(entries) {
  localStorage.setItem("spaceboom_leaderboard", JSON.stringify(entries));
}

function renderLeaderboard(entries) {
  leaderboardList.innerHTML = "";
  entries.slice(0, 10).forEach((entry) => {
    const item = document.createElement("li");
    const flag = entry.country ? countryFlag(entry.country) : "";
    item.innerHTML = `<span>${flag} ${entry.name}</span><strong>${entry.score}</strong>`;
    leaderboardList.appendChild(item);
  });
}

async function loadGlobalLeaderboard() {
  const { supabaseUrl, supabaseKey } = getSupabaseConfig();
  if (!supabaseUrl || !supabaseKey) {
    state.usingGlobalRanking = false;
    renderLeaderboard(loadLeaderboard());
    return;
  }

  state.usingGlobalRanking = true;
  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/scores?select=name,score,country&order=score.desc&limit=10`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    );
    const data = await response.json();
    renderLeaderboard(Array.isArray(data) ? data : []);
  } catch (error) {
    console.error("Falha ao carregar ranking global", error);
    state.usingGlobalRanking = false;
    renderLeaderboard(loadLeaderboard());
  }
}

async function submitScore() {
  const { supabaseUrl, supabaseKey } = getSupabaseConfig();
  const country = await fetchCountry();

  if (!supabaseUrl || !supabaseKey) {
    const entries = loadLeaderboard();
    entries.push({ name: state.playerName, score: state.score, country });
    entries.sort((a, b) => b.score - a.score);
    saveLeaderboard(entries.slice(0, 10));
    renderLeaderboard(entries);
    return;
  }

  try {
    await fetch(`${supabaseUrl}/rest/v1/scores`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        name: state.playerName,
        score: state.score,
        country,
      }),
    });
    await loadGlobalLeaderboard();
  } catch (error) {
    console.error("Falha ao enviar pontuação", error);
  }
}

function getSupabaseConfig() {
  return {
    supabaseUrl: document.body.dataset.supabaseUrl,
    supabaseKey: document.body.dataset.supabaseKey,
  };
}

async function fetchCountry() {
  if (state.countryCode) return state.countryCode;
  try {
    const response = await fetch("https://ipapi.co/json/");
    const data = await response.json();
    state.countryCode = data.country_code || "";
  } catch (error) {
    console.error("Falha ao obter país", error);
  }
  return state.countryCode;
}

function countryFlag(countryCode) {
  if (!countryCode) return "";
  return countryCode
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt()));
}

function initAudio() {
  if (state.audioContext) return;
  state.audioContext = new (window.AudioContext || window.webkitAudioContext)();
}

async function unlockAudio() {
  if (!state.audioContext) return;
  if (state.audioContext.state === "suspended") {
    await state.audioContext.resume();
  }
  const buffer = state.audioContext.createBuffer(1, 1, 22050);
  const source = state.audioContext.createBufferSource();
  source.buffer = buffer;
  source.connect(state.audioContext.destination);
  source.start(0);
}

function playShotSound() {
  if (state.muted) return;
  if (!state.audioContext) return;
  const now = state.audioContext.currentTime;
  if (now - state.lastShotSound < 0.05) return;
  state.lastShotSound = now;

  const osc = state.audioContext.createOscillator();
  const gain = state.audioContext.createGain();
  osc.type = "square";
  osc.frequency.setValueAtTime(520, now);
  gain.gain.setValueAtTime(0.08, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
  osc.connect(gain).connect(state.audioContext.destination);
  osc.start(now);
  osc.stop(now + 0.12);
}

function playExplosionSound() {
  if (state.muted) return;
  if (!state.audioContext) return;
  const now = state.audioContext.currentTime;
  const bufferSize = state.audioContext.sampleRate * 0.2;
  const buffer = state.audioContext.createBuffer(1, bufferSize, state.audioContext.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i += 1) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
  }
  const source = state.audioContext.createBufferSource();
  const gain = state.audioContext.createGain();
  source.buffer = buffer;
  gain.gain.setValueAtTime(0.2, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
  source.connect(gain).connect(state.audioContext.destination);
  source.start(now);
}

function toggleMute() {
  state.muted = !state.muted;
  updateText();
}

function decodeJwt(token) {
  const payload = token.split(".")[1];
  const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
  return JSON.parse(decoded);
}

function handleGoogleCredential(response) {
  try {
    const profile = decodeJwt(response.credential);
    state.playerName = profile.name || profile.given_name || "Jogador";
    playerNameEl.textContent = state.playerName;
  } catch (error) {
    console.error("Falha ao decodificar token", error);
  }
}

function initGoogleAuth() {
  const clientId = document.body.dataset.googleClientId;
  if (!clientId) {
    loginButton.disabled = true;
    loginButton.textContent = "Client ID ausente";
    return;
  }
  if (!window.google || !window.google.accounts || !window.google.accounts.id) {
    loginButton.disabled = true;
    loginButton.textContent = "Carregando Google...";
    return;
  }
  window.google.accounts.id.initialize({
    client_id: clientId,
    callback: handleGoogleCredential,
  });
  loginButton.addEventListener("click", () => {
    window.google.accounts.id.prompt();
  });
}

async function toggleFullscreen() {
  const text = translations[state.language];
  const target = canvas;
  if (!document.fullscreenElement) {
    try {
      await target.requestFullscreen();
    } catch (error) {
      console.warn("Fullscreen indisponível", error);
    }
  } else {
    await document.exitFullscreen();
  }
  fullscreenButton.textContent = document.fullscreenElement
    ? text.exitFullscreen
    : text.fullscreen;
}

async function startGame() {
  state.running = true;
  startOverlay.classList.add("hidden");
  initAudio();
  await unlockAudio();
}

function pauseGame() {
  state.running = false;
  startOverlay.classList.remove("hidden");
}

function updateText() {
  const text = translations[state.language];
  if (!text) return;

  languageToggle.textContent = text.language;
  tagline.textContent = text.tagline;
  subtitle.textContent = text.subtitle;
  startTitle.textContent = text.startTitle;
  startSubtitle.textContent = text.startSubtitle;
  controlsHint.textContent = text.controlsHint;
  touchHint.textContent = text.touchHint;
  leaderboardTitle.textContent = text.leaderboardTitle;
  submitScoreButton.textContent = text.submitScore;
  loginButton.textContent = text.login;
  muteButton.textContent = state.muted ? text.muteOff : text.muteOn;
  fullscreenButton.textContent = document.fullscreenElement ? text.exitFullscreen : text.fullscreen;
  rankingHint.textContent = text.rankingHint;
  rankingHint2.textContent = text.rankingHint2;
  statusHint.textContent = state.usingGlobalRanking ? text.statusGlobal : text.statusLocal;
}

function toggleLanguage() {
  state.language = state.language === "pt" ? "en" : "pt";
  document.documentElement.lang = state.language === "pt" ? "pt-BR" : "en";
  updateText();
}

function handleInputStart() {
  initAudio();
  unlockAudio();
}

function handlePointerDown(event) {
  state.dragging = true;
  state.pointerId = event.pointerId;
  canvas.setPointerCapture(event.pointerId);
  handlePointerMove(event);
}

function handlePointerMove(event) {
  if (!state.dragging && event.pointerType !== "mouse") return;
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  state.ship.x = clamp(x, -0.9, 0.9);
}

function handlePointerUp(event) {
  if (state.pointerId !== event.pointerId) return;
  state.dragging = false;
  state.pointerId = null;
}

canvas.addEventListener(
  "touchmove",
  (event) => {
    event.preventDefault();
  },
  { passive: false }
);

window.addEventListener("resize", resizeCanvas);
window.addEventListener("keydown", (event) => {
  keys.add(event.key);
  handleInputStart();
});
window.addEventListener("keyup", (event) => {
  keys.delete(event.key);
});
canvas.addEventListener("pointerdown", (event) => {
  handleInputStart();
  handlePointerDown(event);
});
canvas.addEventListener("pointermove", handlePointerMove);
canvas.addEventListener("pointerup", handlePointerUp);
canvas.addEventListener("pointercancel", handlePointerUp);
startOverlay.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  startGame();
});

muteButton.addEventListener("click", () => {
  handleInputStart();
  toggleMute();
});
submitScoreButton.addEventListener("click", submitScore);
languageToggle.addEventListener("click", toggleLanguage);
fullscreenButton.addEventListener("click", toggleFullscreen);

initStars();
resizeCanvas();
loadGlobalLeaderboard().then(updateText);
window.addEventListener("load", initGoogleAuth);
document.addEventListener("fullscreenchange", updateText);
requestAnimationFrame(gameLoop);
