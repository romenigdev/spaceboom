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
    z: 0,
    width: 0.18,
    height: 0.22,
    speed: 0.02,
    rotation: 0,
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
    attribute vec3 a_position;
    attribute vec3 a_color;
    uniform mat4 u_matrix;
    varying vec3 v_color;
    void main() {
      gl_Position = u_matrix * vec4(a_position, 1.0);
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
const matrixLocation = gl.getUniformLocation(program, "u_matrix");

const keys = new Set();

const meshes = {
  ship: createShipMesh(),
  bullet: createBoxMesh(0.02, 0.08, 0.04),
  asteroid: createAsteroidMesh(),
};

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
  state.ship.rotation = 0;
}

function addBullet() {
  state.bullets.push({
    x: state.ship.x,
    y: state.ship.y + state.ship.height / 2,
    z: 0,
    speed: 0.05,
  });
  playShotSound();
}

function addAsteroid() {
  const size = randomBetween(0.1, 0.18);
  state.asteroids.push({
    x: randomBetween(-0.85, 0.85),
    y: 1.2,
    z: randomBetween(-0.3, 0.2),
    radius: size / 2,
    speed: randomBetween(0.006, 0.014),
    spin: randomBetween(-0.03, 0.03),
    rotation: randomBetween(0, Math.PI * 2),
    mesh: createAsteroidMesh(),
    scale: size,
  });
}

function addExplosion(x, y, z) {
  for (let i = 0; i < 18; i += 1) {
    const angle = randomBetween(0, Math.PI * 2);
    const speed = randomBetween(0.01, 0.03);
    state.particles.push({
      x,
      y,
      z,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: randomBetween(20, 40),
      size: randomBetween(0.01, 0.02),
    });
  }
  playExplosionSound();
}

function initStars() {
  state.stars = Array.from({ length: 140 }, () => ({
    x: randomBetween(-1, 1),
    y: randomBetween(-1, 1),
    z: randomBetween(-0.6, 0.2),
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
      star.z = randomBetween(-0.6, 0.2);
    }
  });
}

function updateGame(delta) {
  const moveX =
    (keys.has("ArrowLeft") || keys.has("a") ? -1 : 0) +
    (keys.has("ArrowRight") || keys.has("d") ? 1 : 0);

  state.ship.x = clamp(state.ship.x + moveX * state.ship.speed * delta, -0.9, 0.9);
  state.ship.rotation = moveX * -0.2;

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
  state.bullets = state.bullets.filter((bullet) => bullet.y < 1.3);

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
      if (isColliding(asteroid, bullet, asteroid.radius)) {
        destroyed = true;
        bullet.y = 2;
        state.score += 10;
        addExplosion(asteroid.x, asteroid.y, asteroid.z);
      }
    });
    if (!destroyed) {
      remainingAsteroids.push(asteroid);
    }
  });
  state.asteroids = remainingAsteroids;

  const shipHit = state.asteroids.some((asteroid) => isColliding(asteroid, state.ship, 0.12));
  if (shipHit) {
    state.bestScore = Math.max(state.bestScore, state.score);
    bestScoreEl.textContent = state.bestScore;
    resetGame();
    pauseGame();
  }

  updateHUD();
}

function isColliding(a, b, radius) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy) < radius;
}

function updateHUD() {
  scoreEl.textContent = state.score.toString();
  bestScoreEl.textContent = state.bestScore.toString();
}

function draw() {
  gl.clearColor(0.02, 0.04, 0.08, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);

  gl.useProgram(program);
  gl.enableVertexAttribArray(positionLocation);
  gl.enableVertexAttribArray(colorLocation);

  const projection = createPerspectiveMatrix(60, canvas.width / canvas.height, 0.1, 10);
  const view = createTranslationMatrix(0, 0, -3.2);

  drawStars(projection, view);
  drawShip(projection, view);
  state.bullets.forEach((bullet) =>
    drawMesh(meshes.bullet, projection, view, [bullet.x, bullet.y, 0], [0, 0, 0], 1, [0.9, 0.9, 0.2])
  );
  state.asteroids.forEach((asteroid) =>
    drawMesh(
      asteroid.mesh,
      projection,
      view,
      [asteroid.x, asteroid.y, asteroid.z],
      [asteroid.rotation, asteroid.rotation * 0.7, asteroid.rotation * 1.1],
      asteroid.scale,
      [0.7, 0.45, 0.6]
    )
  );
  state.particles.forEach((particle) =>
    drawMesh(
      meshes.bullet,
      projection,
      view,
      [particle.x, particle.y, particle.z],
      [0, 0, 0],
      particle.size * 2,
      [1.0, 0.6, 0.2]
    )
  );
}

function drawStars(projection, view) {
  state.stars.forEach((star) => {
    drawMesh(
      meshes.bullet,
      projection,
      view,
      [star.x, star.y, star.z],
      [0, 0, 0],
      star.size,
      [0.4, 0.6, 1.0]
    );
  });
}

function drawShip(projection, view) {
  drawMesh(
    meshes.ship,
    projection,
    view,
    [state.ship.x, state.ship.y, 0],
    [0, 0, state.ship.rotation],
    1,
    [0.2, 0.7, 1.0]
  );
}

function drawMesh(mesh, projection, view, position, rotation, scale, color) {
  const model = createModelMatrix(position, rotation, scale);
  const matrix = multiplyMatrices(projection, multiplyMatrices(view, model));

  const positions = [];
  const colors = [];
  mesh.indices.forEach((index) => {
    const vertex = mesh.vertices[index];
    positions.push(vertex[0], vertex[1], vertex[2]);
    colors.push(...applyColorVariation(color));
  });

  gl.uniformMatrix4fv(matrixLocation, false, matrix);

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
  gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(colors), gl.STATIC_DRAW);
  gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);

  gl.drawArrays(gl.TRIANGLES, 0, positions.length / 3);
}

function applyColorVariation(color) {
  const variation = randomBetween(-0.08, 0.08);
  return color.map((channel) => clamp(channel + variation, 0, 1));
}

function createShipMesh() {
  const vertices = [
    [0, 0.16, 0.18],
    [-0.14, -0.12, 0.08],
    [0.14, -0.12, 0.08],
    [0, -0.16, -0.12],
  ];
  const indices = [0, 1, 2, 0, 2, 3, 0, 3, 1, 1, 3, 2];
  return { vertices, indices };
}

function createAsteroidMesh() {
  const vertices = [
    [0, 0.18, 0],
    [0.14, 0, 0.14],
    [0, -0.18, 0],
    [-0.14, 0, 0.14],
    [0.14, 0, -0.14],
    [-0.14, 0, -0.14],
  ].map((vertex) => vertex.map((value) => value * randomBetween(0.9, 1.1)));
  const indices = [
    0, 1, 3,
    0, 3, 5,
    0, 5, 4,
    0, 4, 1,
    2, 1, 4,
    2, 4, 5,
    2, 5, 3,
    2, 3, 1,
  ];
  return { vertices, indices };
}

function createBoxMesh(width, height, depth) {
  const w = width / 2;
  const h = height / 2;
  const d = depth / 2;
  const vertices = [
    [-w, -h, -d],
    [w, -h, -d],
    [w, h, -d],
    [-w, h, -d],
    [-w, -h, d],
    [w, -h, d],
    [w, h, d],
    [-w, h, d],
  ];
  const indices = [
    0, 1, 2, 0, 2, 3,
    4, 6, 5, 4, 7, 6,
    0, 4, 5, 0, 5, 1,
    1, 5, 6, 1, 6, 2,
    2, 6, 7, 2, 7, 3,
    3, 7, 4, 3, 4, 0,
  ];
  return { vertices, indices };
}

function createPerspectiveMatrix(fov, aspect, near, far) {
  const f = 1 / Math.tan((fov * Math.PI) / 360);
  const rangeInv = 1 / (near - far);
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, (near + far) * rangeInv, -1,
    0, 0, near * far * rangeInv * 2, 0,
  ]);
}

function createTranslationMatrix(x, y, z) {
  return new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    x, y, z, 1,
  ]);
}

function createRotationXMatrix(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([
    1, 0, 0, 0,
    0, c, s, 0,
    0, -s, c, 0,
    0, 0, 0, 1,
  ]);
}

function createRotationYMatrix(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([
    c, 0, -s, 0,
    0, 1, 0, 0,
    s, 0, c, 0,
    0, 0, 0, 1,
  ]);
}

function createRotationZMatrix(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return new Float32Array([
    c, s, 0, 0,
    -s, c, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1,
  ]);
}

function createScaleMatrix(scale) {
  return new Float32Array([
    scale, 0, 0, 0,
    0, scale, 0, 0,
    0, 0, scale, 0,
    0, 0, 0, 1,
  ]);
}

function createModelMatrix(position, rotation, scale) {
  const translation = createTranslationMatrix(position[0], position[1], position[2]);
  const rotationX = createRotationXMatrix(rotation[0]);
  const rotationY = createRotationYMatrix(rotation[1]);
  const rotationZ = createRotationZMatrix(rotation[2]);
  const scaleMatrix = createScaleMatrix(scale);
  return multiplyMatrices(
    translation,
    multiplyMatrices(rotationZ, multiplyMatrices(rotationY, multiplyMatrices(rotationX, scaleMatrix)))
  );
}

function multiplyMatrices(a, b) {
  const result = new Float32Array(16);
  for (let i = 0; i < 4; i += 1) {
    for (let j = 0; j < 4; j += 1) {
      result[i * 4 + j] =
        a[i * 4 + 0] * b[0 * 4 + j] +
        a[i * 4 + 1] * b[1 * 4 + j] +
        a[i * 4 + 2] * b[2 * 4 + j] +
        a[i * 4 + 3] * b[3 * 4 + j];
    }
  }
  return result;
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
  if (!document.fullscreenElement) {
    try {
      await document.documentElement.requestFullscreen();
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
