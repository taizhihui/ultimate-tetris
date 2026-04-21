(() => {
  const COLS = 10;
  const ROWS = 20;
  const CELL = 30;

  const boardCanvas = document.getElementById('board');
  const ctx = boardCanvas.getContext('2d');
  const nextCanvas = document.getElementById('next');
  const nctx = nextCanvas.getContext('2d');
  const marioStage = document.getElementById('mario-stage');
  const mctx = marioStage ? marioStage.getContext('2d') : null;

  function sizeMarioStage() {
    if (!marioStage) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (marioStage.width !== w) marioStage.width = w;
    if (marioStage.height !== h) marioStage.height = h;
  }
  sizeMarioStage();
  window.addEventListener('resize', sizeMarioStage);

  const scoreEl = document.getElementById('score');
  const linesEl = document.getElementById('lines');
  const levelEl = document.getElementById('level');
  const livesEl = document.getElementById('lives');
  const diffEl = document.getElementById('difficulty');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlaySub = document.getElementById('overlay-sub');
  const startOverlay = document.getElementById('start-overlay');
  const boardFrame = document.querySelector('.board-frame');

  const DIFFICULTIES = {
    easy:   { label: 'EASY',   startSpeed: 1000, speedup: 50, minSpeed: 220, scoreMult: 1.0, linesPerLevel: 10 },
    medium: { label: 'NORMAL', startSpeed: 800,  speedup: 60, minSpeed: 140, scoreMult: 1.5, linesPerLevel: 10 },
    hard:   { label: 'HARD',   startSpeed: 500,  speedup: 70, minSpeed: 90,  scoreMult: 2.0, linesPerLevel: 8  },
    insane: { label: 'INSANE', startSpeed: 250,  speedup: 60, minSpeed: 50,  scoreMult: 3.0, linesPerLevel: 6  },
  };
  let difficulty = 'medium';

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
  let hardDropping = false;
  let hardDropTargetY = 0;
  let hardDropAccum = 0;
  const HARD_DROP_MS_PER_CELL = 6; // ~167 cells/sec; ~120ms for a full-board drop
  let celebrationTimer = 0;
  const CELEBRATION_MS = 3800;
  let graffitiTags = [];
  const GRAFFITI_WORDS = ['TETRIS!', 'SUPER!', 'BRAVO!', 'WOW!', 'AMAZING!', '4 LINES!', 'PRINCESS!', 'LEGEND!', 'MAMMA MIA!', 'LEVEL UP!'];
  const GRAFFITI_COLORS = ['#ff4da6', '#80ff00', '#00e5ff', '#fcd000', '#ff8c00', '#ff66ff', '#ffffff', '#ff3030'];

  function spawnGraffiti() {
    graffitiTags = [];
    // Bias tag placement to the margins of the viewport so the game panel
    // (centered, z-index 2) doesn't hide most of them.
    const regions = [
      { x: [0.03, 0.25], y: [0.08, 0.78] }, // left of panel
      { x: [0.75, 0.97], y: [0.08, 0.78] }, // right of panel
      { x: [0.12, 0.88], y: [0.02, 0.12] }, // top strip above panel
      { x: [0.12, 0.88], y: [0.86, 0.95] }, // bottom strip above ground
    ];
    const COUNT = 10;
    const used = new Set();
    for (let i = 0; i < COUNT; i++) {
      let word;
      let tries = 0;
      do {
        word = GRAFFITI_WORDS[Math.floor(Math.random() * GRAFFITI_WORDS.length)];
        tries++;
      } while (used.has(word) && tries < 20);
      used.add(word);
      const r = regions[i % regions.length];
      graffitiTags.push({
        text: word,
        x: r.x[0] + Math.random() * (r.x[1] - r.x[0]),
        y: r.y[0] + Math.random() * (r.y[1] - r.y[0]),
        rot: (Math.random() - 0.5) * 0.55,
        size: 32 + Math.random() * 40,
        color: GRAFFITI_COLORS[Math.floor(Math.random() * GRAFFITI_COLORS.length)],
        bornAt: Math.random() * 0.22,
      });
    }
  }

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
        window.GameAudio && GameAudio.sfxRotate();
        return;
      }
    }
  }

  function move(dx) {
    if (!current) return;
    if (!collides(current.shape, current.x + dx, current.y)) {
      current.x += dx;
      window.GameAudio && GameAudio.sfxMove();
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
    if (!current || hardDropping) return;
    let dist = 0;
    let probeY = current.y;
    while (!collides(current.shape, current.x, probeY + 1)) {
      probeY++;
      dist++;
    }
    if (dist === 0) {
      // already resting; just lock
      lockPiece();
      return;
    }
    hardDropTargetY = probeY;
    hardDropAccum = 0;
    hardDropping = true;
    score += dist * 2; // commit score immediately; animation just visualizes the descent
    updateHud();
  }

  function stepHardDrop(delta) {
    if (!hardDropping || !current) return;
    hardDropAccum += delta;
    while (hardDropAccum >= HARD_DROP_MS_PER_CELL && current.y < hardDropTargetY) {
      current.y += 1;
      hardDropAccum -= HARD_DROP_MS_PER_CELL;
    }
    if (current.y >= hardDropTargetY) {
      hardDropping = false;
      hardDropAccum = 0;
      lockPiece();
    }
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
      const cfg = DIFFICULTIES[difficulty];
      const pts = [0, 40, 100, 300, 1200][full.length] * level;
      score += Math.round(pts * cfg.scoreMult);
      lines += full.length;
      const leveledUp = lines >= level * cfg.linesPerLevel;
      if (leveledUp) {
        level += 1;
        dropInterval = Math.max(cfg.minSpeed, cfg.startSpeed - (level - 1) * cfg.speedup);
      }
      boardFrame.classList.add('flashing');
      if (window.GameAudio) {
        if (full.length >= 4) GameAudio.victoryFanfare();
        else GameAudio.sfxLine();
        if (leveledUp) GameAudio.sfxLevelUp();
      }
      if (full.length >= 4) {
        celebrationTimer = CELEBRATION_MS;
        spawnGraffiti();
        // Reward the player: the next piece gets a power-up skin (star or mushroom).
        if (next) next.texture = Math.random() < 0.5 ? 'star' : 'mushroom';
      }
    } else {
      window.GameAudio && GameAudio.sfxLock();
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
    overlaySub.textContent = 'PRESS R TO CHANGE MODE';
    overlay.classList.remove('hidden');
    if (window.GameAudio) {
      GameAudio.stopMusic();
      GameAudio.sfxGameOver();
    }
  }

  function restart() {
    const cfg = DIFFICULTIES[difficulty];
    grid = createGrid();
    score = 0;
    lines = 0;
    level = 1;
    lives = 3;
    dropInterval = cfg.startSpeed;
    dropCounter = 0;
    clearingRows = [];
    lineClearTimer = 0;
    hardDropping = false;
    hardDropAccum = 0;
    celebrationTimer = 0;
    running = true;
    paused = false;
    gameOver = false;
    next = null;
    current = null;
    overlay.classList.add('hidden');
    spawn();
    updateHud();
  }

  function chooseDifficulty(d) {
    if (!DIFFICULTIES[d]) return;
    difficulty = d;
    startOverlay.classList.add('hidden');
    restart();
    window.GameAudio && GameAudio.startMusic();
  }

  function showStartScreen() {
    running = false;
    paused = false;
    gameOver = false;
    celebrationTimer = 0;
    graffitiTags = [];
    clearingRows = [];
    lineClearTimer = 0;
    hardDropping = false;
    boardFrame.classList.remove('flashing');
    overlay.classList.add('hidden');
    startOverlay.classList.remove('hidden');
    window.GameAudio && GameAudio.stopMusic();
  }

  function togglePause() {
    if (gameOver) return;
    paused = !paused;
    if (paused) {
      overlayTitle.textContent = 'PAUSED';
      overlaySub.textContent = 'PRESS P TO RESUME';
      overlay.classList.remove('hidden');
      window.GameAudio && GameAudio.stopMusic();
    } else {
      overlay.classList.add('hidden');
      window.GameAudio && GameAudio.startMusic();
    }
  }

  function updateHud() {
    scoreEl.textContent = String(score).padStart(6, '0');
    linesEl.textContent = String(lines).padStart(2, '0');
    const world = Math.min(8, Math.ceil(level / 4));
    const stage = ((level - 1) % 4) + 1;
    levelEl.textContent = `${world}-${stage}`;
    livesEl.textContent = String(lives);
    if (diffEl) diffEl.textContent = DIFFICULTIES[difficulty].label;
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
      case 'mushroom': drawMushroomBlock(c, x, y, s); break;
      default: drawBrick(c, x, y, s);
    }
  }

  // Super Mushroom: red cap with white spots, cream stalk with eyes.
  function drawMushroomBlock(c, x, y, s) {
    fillRect(c, x, y, s, s, '#fcdcb0'); // stalk base
    // red cap covers the top 60% of the block
    const capH = Math.round(s * 0.6);
    fillRect(c, x, y, s, capH, '#e40000');
    fillRect(c, x, y, s, 3, '#ff8888'); // highlight
    fillRect(c, x, y + capH - 3, s, 3, '#700000'); // cap shadow edge
    // white spots on the cap
    c.fillStyle = '#ffffff';
    c.beginPath();
    c.arc(x + s * 0.3, y + s * 0.25, s * 0.12, 0, Math.PI * 2);
    c.fill();
    c.beginPath();
    c.arc(x + s * 0.72, y + s * 0.38, s * 0.09, 0, Math.PI * 2);
    c.fill();
    // stalk shading
    fillRect(c, x, y + capH, 3, s - capH, '#c0a070');
    fillRect(c, x + s - 3, y + capH, 3, s - capH, '#c0a070');
    // eyes
    c.fillStyle = '#000000';
    const eyeY = y + capH + Math.max(2, Math.floor((s - capH) * 0.25));
    c.fillRect(x + Math.round(s * 0.32), eyeY, 2, 4);
    c.fillRect(x + Math.round(s * 0.62), eyeY, 2, 4);
    // outer outline
    fillRect(c, x, y + s - 2, s, 2, '#a04810');
    fillRect(c, x + s - 2, y, 2, s, '#a04810');
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
      if (!hardDropping) drawGhost();
      for (let r = 0; r < current.shape.length; r++) {
        for (let c = 0; c < current.shape[r].length; c++) {
          if (current.shape[r][c]) {
            drawCell(current.x + c, current.y + r, current.texture);
          }
        }
      }
    }

  }

  // Procedurally paints a blocky Mario sprite centered at (cx, cy).
  // `stride` (0|1) swaps leg positions so he looks like he's running.
  function drawMario(c, cx, cy, scale = 1, flipX = false, stride = 0) {
    const S = scale;
    c.save();
    c.translate(cx, cy);
    if (flipX) c.scale(-1, 1);
    const box = (x, y, w, h, color) => { c.fillStyle = color; c.fillRect(x * S, y * S, w * S, h * S); };
    // cap (red)
    box(-10, -30, 20, 4, '#e40000');
    box(-14, -26, 28, 6, '#e40000');
    // cap brim shadow
    box(-14, -20, 28, 2, '#a00000');
    // hair / sideburns (brown)
    box(-14, -20, 4, 6, '#6e2800');
    box(10, -20, 4, 6, '#6e2800');
    // face
    box(-10, -20, 20, 14, '#fcc48c');
    // eyes (whites + pupils)
    box(-6, -16, 4, 6, '#ffffff');
    box(2, -16, 4, 6, '#ffffff');
    box(-4, -14, 2, 4, '#000000');
    box(4, -14, 2, 4, '#000000');
    // nose
    box(-2, -10, 6, 4, '#fcc48c');
    box(-2, -8, 6, 2, '#e89060');
    // mustache
    box(-8, -8, 16, 3, '#3a1c00');
    box(-10, -7, 4, 2, '#3a1c00');
    box(6, -7, 4, 2, '#3a1c00');
    // neck
    box(-6, -6, 12, 2, '#fcc48c');
    // shirt (red sleeves visible at shoulders)
    box(-14, -4, 6, 12, '#e40000');
    box(8, -4, 6, 12, '#e40000');
    // overalls (blue torso)
    box(-8, -4, 16, 14, '#0058f8');
    // strap separators
    box(-6, -4, 2, 10, '#003cbf');
    box(4, -4, 2, 10, '#003cbf');
    // overall buttons
    box(-5, 0, 3, 3, '#fcd000');
    box(2, 0, 3, 3, '#fcd000');
    // gloves — arms swing while running
    const armA = stride === 0 ? 0 : -3;
    const armB = stride === 0 ? -3 : 0;
    box(-16, 8 + armA, 6, 4, '#ffffff');
    box(10, 8 + armB, 6, 4, '#ffffff');
    // shoes — legs alternate forward/back
    if (stride === 0) {
      box(-12, 10, 10, 6, '#6e2800');
      box(4, 10, 10, 6, '#6e2800');
      box(-12, 10, 10, 1, '#a86020');
      box(4, 10, 10, 1, '#a86020');
    } else {
      box(-14, 10, 10, 6, '#6e2800');
      box(2, 10, 10, 6, '#6e2800');
      box(-14, 10, 10, 1, '#a86020');
      box(2, 10, 10, 1, '#a86020');
    }
    c.restore();
  }

  // Spray-paint style celebration tags scattered across the scene. Each tag
  // fades in at a staggered time, stays, then fades out near the end.
  function drawGraffiti(progress) {
    if (!graffitiTags.length) return;
    const W = marioStage.width;
    const H = marioStage.height;
    for (const tag of graffitiTags) {
      const age = progress - tag.bornAt;
      if (age < 0) continue;
      const fadeIn = Math.min(1, age / 0.08);
      const fadeOut = 1 - Math.max(0, (progress - 0.85) / 0.15);
      const alpha = Math.max(0, Math.min(fadeIn, fadeOut));
      if (alpha <= 0) continue;

      const cx = tag.x * W;
      const cy = tag.y * H;
      mctx.save();
      mctx.translate(cx, cy);
      mctx.rotate(tag.rot);
      mctx.textAlign = 'center';
      mctx.textBaseline = 'middle';
      mctx.font = `bold ${tag.size}px 'Press Start 2P', monospace`;

      // spray halo — translucent offset copies give a wet-paint glow
      mctx.fillStyle = tag.color;
      for (let i = 0; i < 8; i++) {
        const rx = Math.cos((i / 8) * Math.PI * 2) * 10;
        const ry = Math.sin((i / 8) * Math.PI * 2) * 10;
        mctx.globalAlpha = alpha * 0.08;
        mctx.fillText(tag.text, rx, ry);
      }
      mctx.globalAlpha = alpha;

      // chunky black outline for contrast
      mctx.fillStyle = '#000';
      for (const [dx, dy] of [[-4, 0], [4, 0], [0, -4], [0, 4], [-3, -3], [3, -3], [-3, 3], [3, 3]]) {
        mctx.fillText(tag.text, dx, dy);
      }
      // main fill, with a subtle flashing sheen on the top half
      mctx.fillStyle = tag.color;
      mctx.fillText(tag.text, 0, 0);
      const sheenOn = Math.floor(progress * 12) % 2 === 0;
      if (sheenOn) {
        mctx.fillStyle = '#ffffff';
        mctx.globalAlpha = alpha * 0.4;
        mctx.fillText(tag.text, 0, -2);
      }
      mctx.restore();
    }
  }

  // Mario runs in on a full-viewport stage canvas layered behind the game
  // panel, bounces around, then runs out — graffiti fades in behind him to
  // make the celebration unmissable without blocking the playing field.
  function drawCelebrationStage() {
    if (!mctx || !marioStage) return;
    mctx.clearRect(0, 0, marioStage.width, marioStage.height);
    if (celebrationTimer <= 0) return;

    const elapsed = CELEBRATION_MS - celebrationTimer;
    const progress = elapsed / CELEBRATION_MS;
    const W = marioStage.width;
    const H = marioStage.height;
    const groundY = H - 90; // Mario's feet sit just above the ground strip
    const scale = 2.8;

    drawGraffiti(progress);

    // Phases: run in (0-0.2), celebrate jumping (0.2-0.8), run out (0.8-1.0)
    const RUN_IN_END = 0.2;
    const CELEBRATE_END = 0.8;

    // Pick a side to enter from based on which half of the screen has more room.
    // Use the right half so Mario doesn't cut across the game panel every time;
    // offscreen start / end anchor off the right edge.
    const centerX = W * 0.78;
    const offRight = W + 80;
    const offLeft = -80;

    let marioX, marioY, flip, stride;
    if (progress < RUN_IN_END) {
      const p = progress / RUN_IN_END;
      marioX = offRight + (centerX - offRight) * p;
      marioY = groundY - Math.abs(Math.sin(p * Math.PI * 2)) * 6; // subtle run-bob
      flip = true; // facing left (moving from right to left)
      stride = Math.floor(p * 10) % 2;
    } else if (progress < CELEBRATE_END) {
      const p = (progress - RUN_IN_END) / (CELEBRATE_END - RUN_IN_END);
      const bounces = 3;
      marioX = centerX;
      const jumpY = Math.abs(Math.sin(p * Math.PI * bounces)) * 80;
      marioY = groundY - jumpY;
      // alternate facing during jumps for flair
      flip = Math.floor(p * bounces * 2) % 2 === 0;
      stride = 0;
    } else {
      const p = (progress - CELEBRATE_END) / (1 - CELEBRATE_END);
      marioX = centerX + (offLeft - centerX) * p;
      marioY = groundY - Math.abs(Math.sin(p * Math.PI * 2)) * 6;
      flip = true;
      stride = Math.floor(p * 10) % 2;
    }

    // Coin shower orbiting Mario during the celebrate phase.
    if (progress >= RUN_IN_END && progress < CELEBRATE_END) {
      const t = elapsed / 1000;
      for (let i = 0; i < 8; i++) {
        const ang = t * 3 + (i / 8) * Math.PI * 2;
        const radius = 130 + Math.sin(t * 4 + i) * 22;
        const x = centerX + Math.cos(ang) * radius;
        const y = groundY - 80 + Math.sin(ang) * radius * 0.55;
        mctx.fillStyle = '#fcd000';
        mctx.beginPath();
        mctx.arc(x, y, 10, 0, Math.PI * 2);
        mctx.fill();
        mctx.fillStyle = '#a06000';
        mctx.fillRect(x - 2, y - 4, 3, 8);
      }
    }

    drawMario(mctx, marioX, marioY, scale, flip, stride);

    // Bouncing "TETRIS!" banner anchored above Mario's current position.
    const flashOn = Math.floor(elapsed / 120) % 2 === 0;
    const bannerY = Math.max(40, marioY - 100);
    mctx.save();
    mctx.textAlign = 'center';
    mctx.font = `bold 28px 'Press Start 2P', monospace`;
    mctx.fillStyle = '#000';
    for (const [dx, dy] of [[-3, 0], [3, 0], [0, -3], [0, 3], [-2, -2], [2, -2], [-2, 2], [2, 2]]) {
      mctx.fillText('TETRIS!', marioX + dx, bannerY + dy);
    }
    mctx.fillStyle = flashOn ? '#fcd000' : '#ffffff';
    mctx.fillText('TETRIS!', marioX, bannerY);
    mctx.font = `bold 11px 'Press Start 2P', monospace`;
    mctx.fillStyle = '#000';
    for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) {
      mctx.fillText("LET'S-A GO!", marioX + dx, bannerY + 26 + dy);
    }
    mctx.fillStyle = '#ffffff';
    mctx.fillText("LET'S-A GO!", marioX, bannerY + 26);
    mctx.restore();
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
      if (celebrationTimer > 0) celebrationTimer = Math.max(0, celebrationTimer - delta);
      if (lineClearTimer > 0) {
        lineClearTimer -= delta;
        if (lineClearTimer <= 0) {
          finishLineClears();
        }
      } else if (hardDropping) {
        stepHardDrop(delta);
        dropCounter = 0;
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
    drawCelebrationStage();
    requestAnimationFrame(loop);
  }

  const musicLabelEl = document.getElementById('music-label');
  const sfxLabelEl = document.getElementById('sfx-label');
  function refreshAudioLabels() {
    if (!window.GameAudio) return;
    if (musicLabelEl) musicLabelEl.textContent = GameAudio.isMusicEnabled() ? 'MUSIC ON' : 'MUSIC OFF';
    if (sfxLabelEl) sfxLabelEl.textContent = GameAudio.isSfxEnabled() ? 'SFX ON' : 'SFX OFF';
  }

  function toggleMusicPref() {
    if (!window.GameAudio) return;
    GameAudio.toggleMusic();
    refreshAudioLabels();
  }
  function toggleSfxPref() {
    if (!window.GameAudio) return;
    GameAudio.toggleSfx();
    refreshAudioLabels();
  }

  // ---- input ----
  document.addEventListener('keydown', (e) => {
    if (e.key === 'm' || e.key === 'M') { toggleMusicPref(); return; }
    if (e.key === 'n' || e.key === 'N') { toggleSfxPref(); return; }
    if (e.key === 'r' || e.key === 'R') { showStartScreen(); return; }
    if (gameOver) return;
    if (e.key === 'p' || e.key === 'P') {
      togglePause();
      return;
    }
    if (paused || lineClearTimer > 0 || hardDropping) return;

    switch (e.key) {
      case 'ArrowLeft': move(-1); break;
      case 'ArrowRight': move(1); break;
      case 'ArrowDown': softDrop(); break;
      case 'ArrowUp': tryRotate(); break;
      case ' ': e.preventDefault(); hardDrop(); break;
    }
  });

  document.querySelectorAll('.diff-btn').forEach((btn) => {
    btn.addEventListener('click', () => chooseDifficulty(btn.dataset.diff));
  });
  const musicToggleEl = document.getElementById('music-toggle');
  const sfxToggleEl = document.getElementById('sfx-toggle');
  if (musicToggleEl) musicToggleEl.addEventListener('click', toggleMusicPref);
  if (sfxToggleEl) sfxToggleEl.addEventListener('click', toggleSfxPref);

  // boot — show start screen, let player pick difficulty before starting
  updateHud();
  requestAnimationFrame(loop);
})();
