(() => {
  const COLS = 10;
  const ROWS = 20;
  const CELL = 30;

  const boardCanvas = document.getElementById('board');
  const ctx = boardCanvas.getContext('2d');
  const nextCanvas = document.getElementById('next');
  const nctx = nextCanvas.getContext('2d');

  const scoreEl = document.getElementById('score');
  const linesEl = document.getElementById('lines');
  const levelEl = document.getElementById('level');
  const livesEl = document.getElementById('lives');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlaySub = document.getElementById('overlay-sub');
  const boardFrame = document.querySelector('.board-frame');

  // Each piece is themed with a Mario-style block texture.
  // textures: 'brick' | 'question' | 'pipe' | 'coin' | 'cloud' | 'star' | 'fire'
  const PIECES = {
    I: {
      shape: [
        [0,0,0,0],
        [1,1,1,1],
        [0,0,0,0],
        [0,0,0,0],
      ],
      texture: 'pipe',
    },
    O: {
      shape: [
        [1,1],
        [1,1],
      ],
      texture: 'question',
    },
    T: {
      shape: [
        [0,1,0],
        [1,1,1],
        [0,0,0],
      ],
      texture: 'brick',
    },
    S: {
      shape: [
        [0,1,1],
        [1,1,0],
        [0,0,0],
      ],
      texture: 'star',
    },
    Z: {
      shape: [
        [1,1,0],
        [0,1,1],
        [0,0,0],
      ],
      texture: 'fire',
    },
    L: {
      shape: [
        [0,0,1],
        [1,1,1],
        [0,0,0],
      ],
      texture: 'coin',
    },
    J: {
      shape: [
        [1,0,0],
        [1,1,1],
        [0,0,0],
      ],
      texture: 'cloud',
    },
  };

  const PIECE_KEYS = Object.keys(PIECES);

  let grid = createGrid();
  let current = null;
  let next = null;
  let score = 0;
  let lines = 0;
  let level = 1;
  let lives = 3;
  let dropCounter = 0;
  let dropInterval = 800;
  let lastTime = 0;
  let running = true;
  let paused = false;
  let gameOver = false;
  let lineClearTimer = 0;
  let clearingRows = [];

  function createGrid() {
    return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
  }

  function randomPiece() {
    const key = PIECE_KEYS[Math.floor(Math.random() * PIECE_KEYS.length)];
    const piece = PIECES[key];
    return {
      type: key,
      texture: piece.texture,
      shape: piece.shape.map(row => row.slice()),
      x: Math.floor(COLS / 2) - Math.ceil(piece.shape[0].length / 2),
      y: 0,
    };
  }

  function collides(shape, x, y) {
    for (let r = 0; r < shape.length; r++) {
      for (let c = 0; c < shape[r].length; c++) {
        if (!shape[r][c]) continue;
        const nx = x + c;
        const ny = y + r;
        if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
        if (ny >= 0 && grid[ny][nx]) return true;
      }
    }
    return false;
  }

  function merge(piece) {
    for (let r = 0; r < piece.shape.length; r++) {
      for (let c = 0; c < piece.shape[r].length; c++) {
        if (piece.shape[r][c]) {
          const ny = piece.y + r;
          const nx = piece.x + c;
          if (ny >= 0 && ny < ROWS && nx >= 0 && nx < COLS) {
            grid[ny][nx] = piece.texture;
          }
        }
      }
    }
  }

  function rotate(shape) {
    const size = shape.length;
    const rotated = Array.from({ length: size }, () => Array(size).fill(0));
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        rotated[c][size - 1 - r] = shape[r][c];
      }
    }
    return rotated;
  }

  function tryRotate() {
    if (!current) return;
    const rotated = rotate(current.shape);
    const kicks = [0, -1, 1, -2, 2];
    for (const kick of kicks) {
      if (!collides(rotated, current.x + kick, current.y)) {
        current.shape = rotated;
        current.x += kick;
        return;
      }
    }
  }

  function move(dx) {
    if (!current) return;
    if (!collides(current.shape, current.x + dx, current.y)) {
      current.x += dx;
    }
  }

  function softDrop() {
    if (!current) return;
    if (!collides(current.shape, current.x, current.y + 1)) {
      current.y += 1;
      score += 1;
      updateHud();
    } else {
      lockPiece();
    }
    dropCounter = 0;
  }

  function hardDrop() {
    if (!current) return;
    let dist = 0;
    while (!collides(current.shape, current.x, current.y + 1)) {
      current.y += 1;
      dist++;
    }
    score += dist * 2;
    updateHud();
    lockPiece();
  }

  function lockPiece() {
    merge(current);
    current = null;

    const full = [];
    for (let r = 0; r < ROWS; r++) {
      if (grid[r].every(cell => cell !== null)) full.push(r);
    }

    if (full.length) {
      clearingRows = full;
      lineClearTimer = 280;
      const pts = [0, 40, 100, 300, 1200][full.length] * level;
      score += pts;
      lines += full.length;
      if (lines >= level * 10) {
        level += 1;
        dropInterval = Math.max(80, 800 - (level - 1) * 60);
      }
      boardFrame.classList.add('flashing');
    } else {
      spawn();
    }
    updateHud();
  }

  function finishLineClears() {
    clearingRows.sort((a, b) => a - b);
    for (const r of clearingRows) {
      grid.splice(r, 1);
      grid.unshift(Array(COLS).fill(null));
    }
    clearingRows = [];
    boardFrame.classList.remove('flashing');
    spawn();
  }

  function spawn() {
    current = next || randomPiece();
    next = randomPiece();
    if (collides(current.shape, current.x, current.y)) {
      lives -= 1;
      if (lives <= 0) {
        endGame();
      } else {
        grid = createGrid();
      }
    }
    drawNext();
  }

  function endGame() {
    running = false;
    gameOver = true;
    overlayTitle.textContent = 'GAME OVER';
    overlaySub.textContent = 'PRESS R TO RESTART';
    overlay.classList.remove('hidden');
  }

  function restart() {
    grid = createGrid();
    score = 0;
    lines = 0;
    level = 1;
    lives = 3;
    dropInterval = 800;
    dropCounter = 0;
    clearingRows = [];
    lineClearTimer = 0;
    running = true;
    paused = false;
    gameOver = false;
    next = null;
    current = null;
    overlay.classList.add('hidden');
    spawn();
    updateHud();
  }

  function togglePause() {
    if (gameOver) return;
    paused = !paused;
    if (paused) {
      overlayTitle.textContent = 'PAUSED';
      overlaySub.textContent = 'PRESS P TO RESUME';
      overlay.classList.remove('hidden');
    } else {
      overlay.classList.add('hidden');
    }
  }

  function updateHud() {
    scoreEl.textContent = String(score).padStart(6, '0');
    linesEl.textContent = String(lines).padStart(2, '0');
    const world = Math.min(8, Math.ceil(level / 4));
    const stage = ((level - 1) % 4) + 1;
    levelEl.textContent = `${world}-${stage}`;
    livesEl.textContent = String(lives);
  }

  // ---- drawing ----

  function drawCell(c, r, texture, context = ctx, cellSize = CELL, offsetX = 0, offsetY = 0) {
    const x = offsetX + c * cellSize;
    const y = offsetY + r * cellSize;
    const s = cellSize;
    drawTextureCell(context, x, y, s, texture);
  }

  function drawTextureCell(c, x, y, s, texture) {
    switch (texture) {
      case 'brick': drawBrick(c, x, y, s); break;
      case 'question': drawQuestion(c, x, y, s); break;
      case 'pipe': drawPipe(c, x, y, s); break;
      case 'coin': drawCoinBlock(c, x, y, s); break;
      case 'cloud': drawCloudBlock(c, x, y, s); break;
      case 'star': drawStarBlock(c, x, y, s); break;
      case 'fire': drawFireBlock(c, x, y, s); break;
      default: drawBrick(c, x, y, s);
    }
  }

  function fillRect(c, x, y, w, h, color) {
    c.fillStyle = color;
    c.fillRect(x, y, w, h);
  }

  // Brown bricks — classic "?" block rival
  function drawBrick(c, x, y, s) {
    fillRect(c, x, y, s, s, '#c84c0c');
    fillRect(c, x, y, s, 3, '#f8b060');
    fillRect(c, x, y, 3, s, '#f8b060');
    fillRect(c, x, y + s - 4, s, 4, '#801000');
    fillRect(c, x + s - 4, y, 4, s, '#801000');
    // mortar lines
    c.fillStyle = '#801000';
    c.fillRect(x + 3, y + s / 2 - 1, s - 6, 2);
    c.fillRect(x + s / 2 - 1, y + 3, 2, s / 2 - 2);
    c.fillRect(x + s / 2 - 1, y + s / 2 + 1, 2, s / 2 - 4);
    // inner shade
    c.fillStyle = 'rgba(0,0,0,0.15)';
    c.fillRect(x + 4, y + 4, s - 8, s - 8);
  }

  // Yellow ? block
  function drawQuestion(c, x, y, s) {
    fillRect(c, x, y, s, s, '#fcc048');
    fillRect(c, x, y, s, 3, '#ffe890');
    fillRect(c, x, y, 3, s, '#ffe890');
    fillRect(c, x, y + s - 4, s, 4, '#a04810');
    fillRect(c, x + s - 4, y, 4, s, '#a04810');
    // rivets (corner dots)
    const dot = Math.max(2, Math.floor(s / 10));
    c.fillStyle = '#a04810';
    c.fillRect(x + 4, y + 4, dot, dot);
    c.fillRect(x + s - 4 - dot, y + 4, dot, dot);
    c.fillRect(x + 4, y + s - 4 - dot, dot, dot);
    c.fillRect(x + s - 4 - dot, y + s - 4 - dot, dot, dot);
    // "?" glyph
    c.fillStyle = '#fff';
    const cx = x + s / 2;
    const cy = y + s / 2;
    const u = Math.max(1, Math.floor(s / 12));
    c.fillRect(cx - 2 * u, cy - 4 * u, 4 * u, u);
    c.fillRect(cx + u, cy - 4 * u, u, 2 * u);
    c.fillRect(cx, cy - 2 * u, u, 2 * u);
    c.fillRect(cx - u, cy + u, u, u);
    c.fillStyle = 'rgba(0,0,0,0.4)';
    c.fillRect(cx - 2 * u + 1, cy - 4 * u + 1, 4 * u, 1);
  }

  // Green pipe segment
  function drawPipe(c, x, y, s) {
    fillRect(c, x, y, s, s, '#00a800');
    fillRect(c, x, y, s, 3, '#80d010');
    fillRect(c, x, y, 3, s, '#80d010');
    fillRect(c, x, y + s - 4, s, 4, '#003800');
    fillRect(c, x + s - 4, y, 4, s, '#003800');
    // inner stripe
    c.fillStyle = '#007c00';
    c.fillRect(x + s / 3, y + 3, 3, s - 6);
    c.fillStyle = '#c0ff40';
    c.fillRect(x + 6, y + 3, 3, s - 6);
  }

  // Bright yellow coin glyph
  function drawCoinBlock(c, x, y, s) {
    fillRect(c, x, y, s, s, '#e0a000');
    fillRect(c, x, y, s, 3, '#ffe890');
    fillRect(c, x + s - 4, y, 4, s, '#a04810');
    fillRect(c, x, y + s - 4, s, 4, '#a04810');
    // coin circle
    c.fillStyle = '#fcd000';
    c.beginPath();
    c.arc(x + s / 2, y + s / 2, s / 2 - 5, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#a04810';
    c.lineWidth = 2;
    c.stroke();
    // inner rectangle
    c.fillStyle = '#a04810';
    c.fillRect(x + s / 2 - 2, y + s / 2 - s / 4, 4, s / 2);
  }

  // White cloud-like block
  function drawCloudBlock(c, x, y, s) {
    fillRect(c, x, y, s, s, '#5c94fc');
    // puffy cloud shape
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(x + s * 0.3, y + s * 0.55, s * 0.28, 0, Math.PI * 2);
    c.arc(x + s * 0.55, y + s * 0.4, s * 0.3, 0, Math.PI * 2);
    c.arc(x + s * 0.75, y + s * 0.55, s * 0.25, 0, Math.PI * 2);
    c.arc(x + s * 0.5, y + s * 0.7, s * 0.3, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = 'rgba(0, 120, 200, 0.25)';
    c.fillRect(x, y + s - 4, s, 4);
  }

  // Starman yellow
  function drawStarBlock(c, x, y, s) {
    fillRect(c, x, y, s, s, '#fcd000');
    fillRect(c, x, y, s, 3, '#ffe890');
    fillRect(c, x, y + s - 4, s, 4, '#a06000');
    // star
    c.fillStyle = '#fff';
    const cx = x + s / 2;
    const cy = y + s / 2;
    const r1 = s * 0.38;
    const r2 = s * 0.16;
    c.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = (Math.PI / 5) * i - Math.PI / 2;
      const rad = i % 2 === 0 ? r1 : r2;
      const px = cx + Math.cos(ang) * rad;
      const py = cy + Math.sin(ang) * rad;
      if (i === 0) c.moveTo(px, py);
      else c.lineTo(px, py);
    }
    c.closePath();
    c.fill();
    // eyes
    c.fillStyle = '#000';
    c.fillRect(cx - s * 0.12, cy - s * 0.02, 2, 3);
    c.fillRect(cx + s * 0.08, cy - s * 0.02, 2, 3);
  }

  // Fire flower red
  function drawFireBlock(c, x, y, s) {
    fillRect(c, x, y, s, s, '#e40000');
    fillRect(c, x, y, s, 3, '#ff8888');
    fillRect(c, x, y + s - 4, s, 4, '#700000');
    fillRect(c, x + s - 4, y, 4, s, '#700000');
    // petals
    c.fillStyle = '#fcd000';
    c.beginPath();
    c.arc(x + s / 2, y + s / 2, s * 0.28, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = '#fff';
    c.beginPath();
    c.arc(x + s / 2, y + s / 2, s * 0.12, 0, Math.PI * 2);
    c.fill();
    // little flames around
    c.fillStyle = '#ffb020';
    c.fillRect(x + 4, y + s / 2 - 2, 4, 4);
    c.fillRect(x + s - 8, y + s / 2 - 2, 4, 4);
  }

  function drawGhost() {
    if (!current) return;
    let gy = current.y;
    while (!collides(current.shape, current.x, gy + 1)) gy++;
    ctx.save();
    ctx.globalAlpha = 0.22;
    for (let r = 0; r < current.shape.length; r++) {
      for (let c = 0; c < current.shape[r].length; c++) {
        if (current.shape[r][c]) {
          const x = (current.x + c) * CELL;
          const y = (gy + r) * CELL;
          ctx.fillStyle = '#fff';
          ctx.fillRect(x + 2, y + 2, CELL - 4, CELL - 4);
        }
      }
    }
    ctx.restore();
  }

  function drawBoard() {
    // sky background inside board
    const grad = ctx.createLinearGradient(0, 0, 0, boardCanvas.height);
    grad.addColorStop(0, '#5c94fc');
    grad.addColorStop(1, '#1040a0');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);

    // subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let c = 1; c < COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(c * CELL + 0.5, 0);
      ctx.lineTo(c * CELL + 0.5, ROWS * CELL);
      ctx.stroke();
    }
    for (let r = 1; r < ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(0, r * CELL + 0.5);
      ctx.lineTo(COLS * CELL, r * CELL + 0.5);
      ctx.stroke();
    }

    // locked cells
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const tex = grid[r][c];
        if (tex) {
          if (clearingRows.includes(r) && Math.floor(lineClearTimer / 60) % 2 === 0) {
            fillRect(ctx, c * CELL, r * CELL, CELL, CELL, '#fff');
          } else {
            drawCell(c, r, tex);
          }
        }
      }
    }

    // ghost and current
    if (current && !clearingRows.length) {
      drawGhost();
      for (let r = 0; r < current.shape.length; r++) {
        for (let c = 0; c < current.shape[r].length; c++) {
          if (current.shape[r][c]) {
            drawCell(current.x + c, current.y + r, current.texture);
          }
        }
      }
    }
  }

  function drawNext() {
    nctx.fillStyle = '#000';
    nctx.fillRect(0, 0, nextCanvas.width, nextCanvas.height);
    if (!next) return;
    const size = next.shape.length;
    const cell = Math.floor(Math.min(nextCanvas.width, nextCanvas.height) / (size + 1));
    const offsetX = Math.floor((nextCanvas.width - cell * size) / 2);
    const offsetY = Math.floor((nextCanvas.height - cell * size) / 2);
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (next.shape[r][c]) {
          drawTextureCell(nctx, offsetX + c * cell, offsetY + r * cell, cell, next.texture);
        }
      }
    }
  }

  function loop(time = 0) {
    const delta = time - lastTime;
    lastTime = time;

    if (running && !paused) {
      if (lineClearTimer > 0) {
        lineClearTimer -= delta;
        if (lineClearTimer <= 0) {
          finishLineClears();
        }
      } else {
        dropCounter += delta;
        if (dropCounter > dropInterval) {
          if (current) {
            if (!collides(current.shape, current.x, current.y + 1)) {
              current.y += 1;
            } else {
              lockPiece();
            }
          }
          dropCounter = 0;
        }
      }
    }

    drawBoard();
    requestAnimationFrame(loop);
  }

  // ---- input ----
  document.addEventListener('keydown', (e) => {
    if (gameOver) {
      if (e.key === 'r' || e.key === 'R') restart();
      return;
    }
    if (e.key === 'p' || e.key === 'P') {
      togglePause();
      return;
    }
    if (paused || lineClearTimer > 0) return;

    switch (e.key) {
      case 'ArrowLeft': move(-1); break;
      case 'ArrowRight': move(1); break;
      case 'ArrowDown': softDrop(); break;
      case 'ArrowUp': tryRotate(); break;
      case ' ': e.preventDefault(); hardDrop(); break;
    }
  });

  // boot
  next = randomPiece();
  spawn();
  updateHud();
  requestAnimationFrame(loop);
})();
