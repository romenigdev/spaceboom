const canvas = document.getElementById("gameCanvas");
const gl = canvas.getContext("webgl");
const scoreEl = document.getElementById("score");
const bestScoreEl = document.getElementById("bestScore");
const playerNameEl = document.getElementById("playerName");
const loginButton = document.getElementById("loginButton");
const submitScoreButton = document.getElementById("submitScore");
const leaderboardList = document.getElementById("leaderboardList");

const state = {
  playerName: "Visitante",
  score: 0,
  bestScore: 0,
  running: true,
  ship: {
    x: 0,
    y: -0.7,
    width: 0.12,
    height: 0.18,
    speed: 0.02,
  },
  bullets: [],
  asteroids: [],
  lastShot: 0,
  spawnTimer: 0,
  lastFrame: performance.now(),
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
  state.spawnTimer = 0;
  state.lastShot = 0;
  state.ship.x = 0;
  state.ship.y = -0.7;
}

function addBullet() {
  state.bullets.push({
    x: state.ship.x,
    y: state.ship.y + state.ship.height / 2,
    width: 0.02,
    height: 0.06,
    speed: 0.04,
  });
}

function addAsteroid() {
  const size = randomBetween(0.08, 0.16);
  state.asteroids.push({
    x: randomBetween(-0.9, 0.9),
    y: 1.1,
    width: size,
    height: size,
    speed: randomBetween(0.005, 0.012),
  });
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function update(delta) {
  const moveX =
    (keys.has("ArrowLeft") || keys.has("a") ? -1 : 0) +
    (keys.has("ArrowRight") || keys.has("d") ? 1 : 0);

  state.ship.x = clamp(state.ship.x + moveX * state.ship.speed * delta, -0.9, 0.9);

  state.lastShot += delta;
  if (state.lastShot > 12) {
    addBullet();
    state.lastShot = 0;
  }

  state.spawnTimer += delta;
  if (state.spawnTimer > 40) {
    addAsteroid();
    state.spawnTimer = randomBetween(10, 30);
  }

  state.bullets.forEach((bullet) => {
    bullet.y += bullet.speed * delta;
  });
  state.bullets = state.bullets.filter((bullet) => bullet.y < 1.2);

  state.asteroids.forEach((asteroid) => {
    asteroid.y -= asteroid.speed * delta;
  });

  const remainingAsteroids = [];
  state.asteroids.forEach((asteroid) => {
    let destroyed = false;
    state.bullets.forEach((bullet) => {
      if (isColliding(asteroid, bullet)) {
        destroyed = true;
        bullet.y = 2;
        state.score += 10;
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

  drawRect(state.ship, [0.3, 0.7, 1.0]);
  state.bullets.forEach((bullet) => drawRect(bullet, [0.9, 0.9, 0.2]));
  state.asteroids.forEach((asteroid) => drawRect(asteroid, [0.8, 0.4, 0.4]));
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

  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);
  gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, 0, 0);

  gl.drawArrays(gl.TRIANGLES, 0, 6);
}

function gameLoop(now) {
  const delta = (now - state.lastFrame) / 16;
  state.lastFrame = now;
  resizeCanvas();
  if (state.running) {
    update(delta);
    draw();
  }
  requestAnimationFrame(gameLoop);
}

function loadLeaderboard() {
  const saved = JSON.parse(localStorage.getItem("spaceboom_leaderboard") || "[]");
  return Array.isArray(saved) ? saved : [];
}

function saveLeaderboard(entries) {
  localStorage.setItem("spaceboom_leaderboard", JSON.stringify(entries));
}

function renderLeaderboard() {
  const entries = loadLeaderboard();
  leaderboardList.innerHTML = "";
  entries.slice(0, 10).forEach((entry) => {
    const item = document.createElement("li");
    item.innerHTML = `<span>${entry.name}</span><strong>${entry.score}</strong>`;
    leaderboardList.appendChild(item);
  });
}

function submitScore() {
  const entries = loadLeaderboard();
  entries.push({ name: state.playerName, score: state.score });
  entries.sort((a, b) => b.score - a.score);
  saveLeaderboard(entries.slice(0, 10));
  renderLeaderboard();
}

function handleLogin() {
  const name = window.prompt("Digite seu nome para simular o login Google:");
  if (name) {
    state.playerName = name;
    playerNameEl.textContent = name;
  }
}

window.addEventListener("resize", resizeCanvas);
window.addEventListener("keydown", (event) => {
  keys.add(event.key);
});
window.addEventListener("keyup", (event) => {
  keys.delete(event.key);
});
canvas.addEventListener("pointermove", (event) => {
  const rect = canvas.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  state.ship.x = clamp(x, -0.9, 0.9);
});

loginButton.addEventListener("click", handleLogin);
submitScoreButton.addEventListener("click", submitScore);

renderLeaderboard();
resizeCanvas();
requestAnimationFrame(gameLoop);
