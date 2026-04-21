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
  const bestEl = document.getElementById('best-score');
  const overlay = document.getElementById('overlay');
  const overlayTitle = document.getElementById('overlay-title');
  const overlaySub = document.getElementById('overlay-sub');
  const startOverlay = document.getElementById('start-overlay');
  const boardFrame = document.querySelector('.board-frame');
  const peachBarEl = document.getElementById('peach-bar');

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
  const CELEBRATION_CHARS = ['mario', 'princess', 'luigi'];
  let celebrationCharIndex = 0;
  let celebrationChar = 'mario';

  // --- Starman power-up state ---
  let starmanTimer = 0;
  let starmanHue = 0;

  // --- Mystery piece state ---
  let pendingMystery = false;

  // --- Goomba row sweeper state ---
  let goomba = null;
  let goombaSweepTimer = 0;
  const goombaSweepInterval = { easy: 45000, medium: 60000, hard: 80000, insane: 100000 };

  // --- Princess Peach rescue meter state ---
  let peachProgress = 0;
  let peachGoal = 12;
  let peachCelebTimer = 0;
  const PEACH_CELEB_MS = 2500;

  // --- Shared bonus popup state ---
  let bonusPopupTimer = 0;
  let bonusPopupText = '';
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

  function makeStarmanPiece() {
    return { type: 'STAR', texture: 'star', shape: [[1]], x: Math.floor(COLS / 2), y: 0, isStarman: true };
  }

  function randomPiece() {
    const roll = Math.random();
    if (roll < 0.05) {
      return makeStarmanPiece();
    }
    if (roll < 0.05 + 0.07) {
      return { type: 'MYSTERY', texture: 'question', shape: [[1,1],[1,1]], x: Math.floor((COLS - 2) / 2), y: 0, isMystery: true };
    }
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
    // Capture special flags BEFORE current is nulled
    const wasStarman = current && current.isStarman;
    const wasMystery = current && current.isMystery;

    merge(current);
    current = null;

    // Starman power-up: activate star mode
    if (wasStarman) {
      starmanTimer = 5000;
      bonusPopupText = '\u2605 STAR POWER! \u2605';
      bonusPopupTimer = 2000;
    }

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
        celebrationChar = CELEBRATION_CHARS[celebrationCharIndex % CELEBRATION_CHARS.length];
        celebrationCharIndex++;
        spawnGraffiti();
        // Reward the player: the next piece gets a power-up skin (star or mushroom).
        if (next) next.texture = Math.random() < 0.5 ? 'star' : 'mushroom';
      }
      // If mystery piece caused line clears, defer trigger until finishLineClears
      if (wasMystery) pendingMystery = true;
    } else {
      window.GameAudio && GameAudio.sfxLock();
      spawn();
      if (wasMystery) triggerMystery();
    }
    updateHud();
  }

  function finishLineClears() {
    clearingRows.sort((a, b) => a - b);
    // Capture count BEFORE clearing clearingRows = []
    const clearedCount = clearingRows.length;
    for (const r of clearingRows) {
      grid.splice(r, 1);
      grid.unshift(Array(COLS).fill(null));
    }
    clearingRows = [];
    boardFrame.classList.remove('flashing');
    updatePeachProgress(clearedCount);
    spawn();
    if (pendingMystery) {
      pendingMystery = false;
      triggerMystery();
    }
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

  // ---- leaderboard ----

  const LEADERBOARD_KEY = 'smTetrisLeaderboard';
  const MAX_LB_ENTRIES = 10;

  function loadLeaderboard() {
    try { return JSON.parse(localStorage.getItem(LEADERBOARD_KEY)) || []; }
    catch { return []; }
  }

  function saveScoreToLeaderboard(scoreVal, diff) {
    const entries = loadLeaderboard();
    const rank = entries.filter(e => e.score > scoreVal).length + 1;
    if (rank <= MAX_LB_ENTRIES) {
      entries.push({ score: scoreVal, diff, date: new Date().toLocaleDateString() });
      entries.sort((a, b) => b.score - a.score);
      if (entries.length > MAX_LB_ENTRIES) entries.length = MAX_LB_ENTRIES;
      localStorage.setItem(LEADERBOARD_KEY, JSON.stringify(entries));
    }
    return rank <= MAX_LB_ENTRIES ? rank : null;
  }

  function getBestForDifficulty(diff) {
    const entries = loadLeaderboard().filter(e => e.diff === diff);
    return entries.length ? entries[0].score : 0;
  }

  function renderLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    if (!list) return;
    const entries = loadLeaderboard();
    if (!entries.length) {
      list.innerHTML = '<div class="lb-empty">NO SCORES YET</div>';
      return;
    }
    list.innerHTML = entries.slice(0, 8).map((e, i) => {
      const label = DIFFICULTIES[e.diff] ? DIFFICULTIES[e.diff].label : e.diff;
      return `<div class="lb-row${i === 0 ? ' lb-top' : ''}">` +
        `<span class="lb-rank">${i + 1}</span>` +
        `<span class="lb-diff lb-diff-${e.diff}">${label}</span>` +
        `<span class="lb-score">${String(e.score).padStart(6, '0')}</span>` +
        `<span class="lb-date">${e.date}</span>` +
        `</div>`;
    }).join('');
  }

  function endGame() {
    running = false;
    gameOver = true;
    const rank = saveScoreToLeaderboard(score, difficulty);
    overlayTitle.textContent = 'GAME OVER';
    if (rank === 1) {
      overlaySub.textContent = '\u2605 NEW RECORD! PRESS R \u2605';
    } else if (rank !== null) {
      overlaySub.textContent = `RANK #${rank}! PRESS R`;
    } else {
      overlaySub.textContent = 'PRESS R TO CHANGE MODE';
    }
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
    // Starman reset
    starmanTimer = 0;
    starmanHue = 0;
    // Mystery reset
    pendingMystery = false;
    // Goomba reset
    goomba = null;
    goombaSweepTimer = goombaSweepInterval[difficulty] || 60000;
    // Peach reset
    peachProgress = 0;
    peachGoal = { easy: 8, medium: 12, hard: 16, insane: 22 }[difficulty] || 12;
    peachCelebTimer = 0;
    if (peachBarEl) peachBarEl.style.width = '0%';
    // Popup reset
    bonusPopupTimer = 0;
    bonusPopupText = '';
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
    celebrationCharIndex = 0;
    graffitiTags = [];
    clearingRows = [];
    lineClearTimer = 0;
    hardDropping = false;
    boardFrame.classList.remove('flashing');
    overlay.classList.add('hidden');
    startOverlay.classList.remove('hidden');
    renderLeaderboard();
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
    if (bestEl) bestEl.textContent = String(Math.max(getBestForDifficulty(difficulty), score)).padStart(6, '0');
  }

  // ---- Goomba Row Sweeper helpers ----

  function tryStartGoomba() {
    if (goomba !== null) return; // already active
    const candidates = [];
    const halfRow = Math.floor(ROWS / 2);
    for (let r = halfRow; r < ROWS; r++) {
      if (grid[r].some(cell => cell !== null)) candidates.push(r);
    }
    if (!candidates.length) return;
    const row = candidates[Math.floor(Math.random() * candidates.length)];
    goomba = { row, x: -1 };
  }

  function drawGoomba() {
    if (!goomba) return;
    const x = goomba.x * CELL;
    const y = goomba.row * CELL;
    const S = CELL;
    const step = Math.floor(Math.abs(goomba.x) * 3) % 2;
    ctx.save();
    // Brown body
    ctx.fillStyle = '#8B4513';
    ctx.fillRect(x + S * 0.1, y + S * 0.45, S * 0.8, S * 0.5);
    // Round head (arc)
    ctx.fillStyle = '#8B4513';
    ctx.beginPath();
    ctx.arc(x + S * 0.5, y + S * 0.4, S * 0.38, 0, Math.PI * 2);
    ctx.fill();
    // Tan face
    ctx.fillStyle = '#D2A679';
    ctx.beginPath();
    ctx.arc(x + S * 0.5, y + S * 0.44, S * 0.26, 0, Math.PI * 2);
    ctx.fill();
    // White eyes
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + S * 0.25, y + S * 0.28, S * 0.18, S * 0.16);
    ctx.fillRect(x + S * 0.57, y + S * 0.28, S * 0.18, S * 0.16);
    // Black pupils
    ctx.fillStyle = '#000';
    ctx.fillRect(x + S * 0.28, y + S * 0.31, S * 0.1, S * 0.1);
    ctx.fillRect(x + S * 0.60, y + S * 0.31, S * 0.1, S * 0.1);
    // Angry brows (filled rects, angled look)
    ctx.fillStyle = '#000';
    ctx.fillRect(x + S * 0.22, y + S * 0.22, S * 0.22, S * 0.06);
    ctx.fillRect(x + S * 0.56, y + S * 0.22, S * 0.22, S * 0.06);
    // Feet (alternating based on step)
    ctx.fillStyle = '#5C2A00';
    if (step === 0) {
      ctx.fillRect(x + S * 0.1, y + S * 0.88, S * 0.32, S * 0.12);
      ctx.fillRect(x + S * 0.55, y + S * 0.82, S * 0.32, S * 0.12);
    } else {
      ctx.fillRect(x + S * 0.1, y + S * 0.82, S * 0.32, S * 0.12);
      ctx.fillRect(x + S * 0.55, y + S * 0.88, S * 0.32, S * 0.12);
    }
    ctx.restore();
  }

  // ---- Mystery piece helpers ----

  function triggerMystery() {
    const cfg = DIFFICULTIES[difficulty];
    const effect = Math.floor(Math.random() * 3);
    if (effect === 0) {
      // Clear the 3 lowest filled rows (only if no clearingRows in progress)
      if (!clearingRows.length) {
        let cleared = 0;
        for (let r = ROWS - 1; r >= 0 && cleared < 3; r--) {
          if (grid[r].some(cell => cell !== null)) {
            grid[r] = Array(COLS).fill(null);
            cleared++;
          }
        }
      }
      bonusPopupText = '3 ROWS CLEARED!';
      bonusPopupTimer = 2000;
    } else if (effect === 1) {
      score += Math.round(1200 * level * cfg.scoreMult);
      updateHud();
      bonusPopupText = '+BONUS COINS!';
      bonusPopupTimer = 2000;
    } else {
      next = makeStarmanPiece();
      drawNext();
      bonusPopupText = 'STARMAN INCOMING!';
      bonusPopupTimer = 2000;
    }
    window.GameAudio && GameAudio.sfxLine && GameAudio.sfxLine();
  }

  // ---- Princess Peach helpers ----

  function updatePeachProgress(cleared) {
    if (!cleared) return;
    peachProgress += cleared;
    const pct = Math.min(100, Math.round((peachProgress / peachGoal) * 100));
    if (peachBarEl) peachBarEl.style.width = pct + '%';
    if (peachProgress >= peachGoal) {
      peachProgress = 0;
      if (peachBarEl) peachBarEl.style.width = '0%';
      triggerPeachRescue();
    }
  }

  function triggerPeachRescue() {
    const cfg = DIFFICULTIES[difficulty];
    peachCelebTimer = PEACH_CELEB_MS;
    // Clear the 2 lowest filled rows
    let cleared = 0;
    for (let r = ROWS - 1; r >= 0 && cleared < 2; r--) {
      if (grid[r].some(cell => cell !== null)) {
        grid[r] = Array(COLS).fill(null);
        cleared++;
      }
    }
    score += Math.round(2000 * level * cfg.scoreMult);
    updateHud();
    bonusPopupText = '\u2665 PRINCESS RESCUED! \u2665';
    bonusPopupTimer = PEACH_CELEB_MS;
    window.GameAudio && GameAudio.victoryFanfare && GameAudio.victoryFanfare();
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
      // Starman rainbow flash while starman piece is falling
      if (current.isStarman) {
        ctx.save();
        ctx.globalAlpha = 0.7;
        ctx.fillStyle = `hsl(${starmanHue}, 100%, 60%)`;
        for (let r = 0; r < current.shape.length; r++) {
          for (let c = 0; c < current.shape[r].length; c++) {
            if (current.shape[r][c]) {
              ctx.fillRect((current.x + c) * CELL, (current.y + r) * CELL, CELL, CELL);
            }
          }
        }
        ctx.restore();
      }
      // Mystery piece pulsing yellow glow
      if (current.isMystery) {
        const pulse = 0.3 + Math.sin(Date.now() / 120) * 0.2;
        ctx.save();
        ctx.globalAlpha = pulse;
        ctx.fillStyle = '#ffd700';
        for (let r = 0; r < current.shape.length; r++) {
          for (let c = 0; c < current.shape[r].length; c++) {
            if (current.shape[r][c]) {
              ctx.fillRect((current.x + c) * CELL, (current.y + r) * CELL, CELL, CELL);
            }
          }
        }
        ctx.restore();
      }
    }

    // Starman rainbow overlay (active mode)
    if (starmanTimer > 0) {
      ctx.save();
      ctx.globalAlpha = 0.12 + Math.sin(Date.now() / 80) * 0.05;
      ctx.fillStyle = `hsl(${starmanHue}, 100%, 60%)`;
      ctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
      ctx.restore();
      starmanHue = (starmanHue + 4) % 360;
    }

    // Bonus popup text
    if (bonusPopupTimer > 0 && bonusPopupText) {
      const alpha = Math.min(1, bonusPopupTimer / 400);
      const bounceY = boardCanvas.height / 2 - Math.sin(Date.now() / 200) * 8;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = "bold 11px 'Press Start 2P', monospace";
      // black outline
      ctx.fillStyle = '#000';
      for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2], [-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.fillText(bonusPopupText, boardCanvas.width / 2 + dx, bounceY + dy);
      }
      // gold fill
      ctx.fillStyle = '#fcd000';
      ctx.fillText(bonusPopupText, boardCanvas.width / 2, bounceY);
      ctx.restore();
    }

    // Goomba
    if (goomba !== null) {
      drawGoomba();
    }
  }

  // Shared chibi plumber sprite (Mario / Luigi) — soft rounded cap, big shiny
  // eyes, rosy cheeks. `cfg` swaps colors + emblem so a single routine paints
  // either brother.
  function drawPlumber(c, cx, cy, scale, flipX, stride, cfg) {
    const S = scale;
    c.save();
    c.translate(cx, cy);
    if (flipX) c.scale(-1, 1);
    const box = (x, y, w, h, color) => { c.fillStyle = color; c.fillRect(x * S, y * S, w * S, h * S); };

    // rounded cap (red/green)
    box(-8, -34, 16, 2, cfg.cap);
    box(-11, -32, 22, 2, cfg.cap);
    box(-13, -30, 26, 4, cfg.cap);
    box(-14, -26, 28, 4, cfg.cap);
    // cap highlight stripe for softness
    box(-11, -32, 22, 1, cfg.capLight);
    // emblem badge on cap
    box(-4, -28, 8, 6, '#ffffff');
    if (cfg.emblem === 'M') {
      // M: two legs + diagonal dips
      box(-3, -27, 1, 4, cfg.cap);
      box(2, -27, 1, 4, cfg.cap);
      box(-2, -26, 1, 1, cfg.cap);
      box(1, -26, 1, 1, cfg.cap);
      box(-1, -25, 2, 1, cfg.cap);
    } else {
      // L
      box(-3, -27, 1, 5, cfg.cap);
      box(-2, -23, 4, 1, cfg.cap);
    }
    // cap brim shadow
    box(-14, -22, 28, 2, cfg.capDark);
    // hair / sideburns
    box(-14, -22, 4, 8, cfg.hair);
    box(10, -22, 4, 8, cfg.hair);
    // face (peach)
    box(-10, -22, 20, 16, '#fcc48c');
    // big round eyes — whites
    box(-7, -18, 5, 7, '#ffffff');
    box(2, -18, 5, 7, '#ffffff');
    // colored irises
    box(-6, -16, 3, 4, cfg.eye);
    box(3, -16, 3, 4, cfg.eye);
    // dark pupils
    box(-5, -15, 1, 2, '#000');
    box(4, -15, 1, 2, '#000');
    // shine glints
    box(-4, -17, 1, 1, '#fff');
    box(5, -17, 1, 1, '#fff');
    // rosy cheeks
    box(-10, -10, 3, 2, '#ff9aa8');
    box(7, -10, 3, 2, '#ff9aa8');
    // tiny round nose
    box(-2, -10, 5, 3, '#fcc48c');
    box(-2, -8, 5, 1, '#e89060');
    box(-1, -9, 1, 1, '#ffe2c0'); // nose highlight
    // friendly smile
    box(-4, -5, 8, 2, '#3a1c00');
    box(-5, -6, 1, 1, '#3a1c00');
    box(4, -6, 1, 1, '#3a1c00');
    // mustache sits just above the smile
    box(-8, -7, 16, 2, cfg.mustache);
    box(-10, -6, 3, 1, cfg.mustache);
    box(7, -6, 3, 1, cfg.mustache);
    // chin / neck
    box(-5, -4, 10, 2, '#fcc48c');
    // shirt sleeves (cap color)
    box(-14, -2, 6, 12, cfg.cap);
    box(8, -2, 6, 12, cfg.cap);
    box(-14, -2, 6, 1, cfg.capLight);
    box(8, -2, 6, 1, cfg.capLight);
    // blue overalls
    box(-8, -2, 16, 14, '#0058f8');
    box(-8, -2, 16, 1, '#3078ff');
    // overall straps
    box(-6, -2, 2, 10, '#003cbf');
    box(4, -2, 2, 10, '#003cbf');
    // yellow buttons
    box(-5, 2, 3, 3, '#fcd000');
    box(-4, 2, 1, 1, '#fff'); // button shine
    box(2, 2, 3, 3, '#fcd000');
    box(3, 2, 1, 1, '#fff');
    // gloves (arms swing)
    const armA = stride === 0 ? 0 : -3;
    const armB = stride === 0 ? -3 : 0;
    box(-16, 8 + armA, 6, 4, '#ffffff');
    box(10, 8 + armB, 6, 4, '#ffffff');
    box(-16, 8 + armA, 6, 1, '#ffffff');
    // shoes
    if (stride === 0) {
      box(-12, 12, 10, 6, cfg.hair);
      box(4, 12, 10, 6, cfg.hair);
      box(-12, 12, 10, 1, cfg.shoeLight);
      box(4, 12, 10, 1, cfg.shoeLight);
    } else {
      box(-14, 12, 10, 6, cfg.hair);
      box(2, 12, 10, 6, cfg.hair);
      box(-14, 12, 10, 1, cfg.shoeLight);
      box(2, 12, 10, 1, cfg.shoeLight);
    }
    c.restore();
  }

  function drawMario(c, cx, cy, scale = 1, flipX = false, stride = 0) {
    drawPlumber(c, cx, cy, scale, flipX, stride, {
      cap: '#e40000', capLight: '#ff6868', capDark: '#a00000',
      hair: '#6e2800', mustache: '#3a1c00',
      eye: '#2f50c8', shoeLight: '#a86020',
      emblem: 'M',
    });
  }

  function drawLuigi(c, cx, cy, scale = 1, flipX = false, stride = 0) {
    drawPlumber(c, cx, cy, scale, flipX, stride, {
      cap: '#00a800', capLight: '#80e060', capDark: '#004400',
      hair: '#3a1c00', mustache: '#2a1000',
      eye: '#308040', shoeLight: '#5a3010',
      emblem: 'L',
    });
  }

  // Princess Peach — crown, flowing blonde hair, pink gown. Slightly taller
  // silhouette than the plumbers; skirt hem hides her legs so "stride"
  // just tilts the hem left/right for a gentle skip.
  function drawPrincess(c, cx, cy, scale = 1, flipX = false, stride = 0) {
    const S = scale;
    c.save();
    c.translate(cx, cy);
    if (flipX) c.scale(-1, 1);
    const box = (x, y, w, h, color) => { c.fillStyle = color; c.fillRect(x * S, y * S, w * S, h * S); };

    // crown — golden zigzag
    box(-7, -34, 14, 3, '#fcd000');
    box(-7, -36, 2, 2, '#fcd000');
    box(-1, -37, 2, 3, '#fcd000');
    box(5, -36, 2, 2, '#fcd000');
    // crown gems
    box(-1, -35, 2, 2, '#ff3060');
    box(-5, -33, 1, 1, '#40b0ff');
    box(4, -33, 1, 1, '#40b0ff');
    // crown shadow / band
    box(-7, -31, 14, 1, '#a06000');

    // blonde hair — top + long side locks
    box(-10, -30, 20, 4, '#fce078');
    box(-12, -28, 24, 4, '#fce078');
    // hair highlights
    box(-9, -30, 6, 1, '#fff6b8');
    box(3, -30, 5, 1, '#fff6b8');
    // flowing side locks down past the jaw
    box(-14, -26, 4, 16, '#fce078');
    box(10, -26, 4, 16, '#fce078');
    box(-14, -10, 3, 4, '#fce078'); // curl tip
    box(11, -10, 3, 4, '#fce078');
    // bangs
    box(-10, -26, 20, 3, '#fce078');
    box(-2, -26, 1, 5, '#fce078'); // center widow's-peak
    // hair shadow under bangs
    box(-10, -23, 20, 1, '#d8b040');

    // face
    box(-10, -22, 20, 14, '#ffd8b0');
    // big shiny eyes
    box(-7, -18, 5, 7, '#ffffff');
    box(2, -18, 5, 7, '#ffffff');
    box(-6, -16, 3, 4, '#1e60d0');
    box(3, -16, 3, 4, '#1e60d0');
    box(-5, -15, 1, 2, '#000');
    box(4, -15, 1, 2, '#000');
    box(-4, -17, 1, 1, '#fff');
    box(5, -17, 1, 1, '#fff');
    // long lashes
    box(-8, -18, 1, 1, '#3a1c00');
    box(-2, -18, 1, 1, '#3a1c00');
    box(1, -18, 1, 1, '#3a1c00');
    box(7, -18, 1, 1, '#3a1c00');
    // rosy cheeks
    box(-10, -10, 3, 2, '#ff8fb0');
    box(7, -10, 3, 2, '#ff8fb0');
    // button nose
    box(-1, -10, 3, 2, '#ffd8b0');
    box(0, -9, 1, 1, '#e08080');
    // sweet smile
    box(-3, -6, 6, 1, '#cc3060');
    box(-4, -7, 1, 1, '#cc3060');
    box(3, -7, 1, 1, '#cc3060');
    box(-3, -5, 6, 1, '#ffb0c8'); // lipstick sheen
    // earrings
    box(-13, -14, 2, 2, '#40b0ff');
    box(11, -14, 2, 2, '#40b0ff');

    // neck
    box(-3, -8, 6, 2, '#ffd8b0');

    // pink gown — fitted bodice
    box(-8, -6, 16, 6, '#ff8fc8');
    box(-8, -6, 16, 1, '#ffb8dc');
    // gem brooch
    box(-1, -2, 2, 2, '#fcd000');
    // puffy shoulders
    box(-12, -5, 5, 5, '#ff8fc8');
    box(7, -5, 5, 5, '#ff8fc8');
    // white gloves at the cuffs, with puff
    box(-14, 0, 4, 5, '#ffffff');
    box(10, 0, 4, 5, '#ffffff');
    box(-15, 4, 6, 5, '#ffffff');
    box(9, 4, 6, 5, '#ffffff');
    // bracelets
    box(-15, 3, 6, 1, '#fcd000');
    box(9, 3, 6, 1, '#fcd000');

    // flared skirt — widens as it descends. Stride tilts the hem slightly so
    // the dress looks like it's swaying with a skip.
    const sway = stride === 0 ? -1 : 1;
    box(-9, 0, 18, 4, '#ff8fc8');
    box(-11, 4, 22, 4, '#ff8fc8');
    box(-13 + sway, 8, 26, 4, '#ff8fc8');
    box(-15 + sway, 12, 30, 4, '#ff8fc8');
    // skirt shading
    box(-15 + sway, 12, 30, 1, '#ffbde0');
    box(-15 + sway, 15, 30, 1, '#d8508a');
    // tiny heels peeking out
    box(-6, 16, 4, 2, '#ff3060');
    box(2, 16, 4, 2, '#ff3060');
    c.restore();
  }

  function drawCelebrationCharacter(name, c, cx, cy, scale, flipX, stride) {
    if (name === 'luigi') drawLuigi(c, cx, cy, scale, flipX, stride);
    else if (name === 'princess') drawPrincess(c, cx, cy, scale, flipX, stride);
    else drawMario(c, cx, cy, scale, flipX, stride);
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
    if (celebrationTimer <= 0 && peachCelebTimer <= 0) return;

    const W = marioStage.width;
    const H = marioStage.height;

    // Mario celebration (only when celebrationTimer is active)
    if (celebrationTimer > 0) {
      const elapsed = CELEBRATION_MS - celebrationTimer;
      const progress = elapsed / CELEBRATION_MS;
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

      drawCelebrationCharacter(celebrationChar, mctx, marioX, marioY, scale, flip, stride);

      // Bouncing banner — catchphrase varies per guest star.
      const catchphrase =
        celebrationChar === 'luigi' ? "MAMMA LUIGI!" :
        celebrationChar === 'princess' ? "THANK YOU!" :
        "LET'S-A GO!";
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
        mctx.fillText(catchphrase, marioX + dx, bannerY + 26 + dy);
      }
      mctx.fillStyle = '#ffffff';
      mctx.fillText(catchphrase, marioX, bannerY + 26);
      mctx.restore();
    }

    // Peach rescue celebration
    if (peachCelebTimer > 0) {
      const peachProgress2 = 1 - peachCelebTimer / PEACH_CELEB_MS;
      const fadeAlpha = peachCelebTimer < 500 ? peachCelebTimer / 500 : Math.min(1, peachProgress2 / 0.15);
      const peachX = W * 0.22;
      const peachBaseY = H * 0.38;
      const bounce = Math.sin(Date.now() / 180) * 12;
      mctx.save();
      mctx.globalAlpha = Math.max(0, Math.min(1, fadeAlpha));
      mctx.textAlign = 'center';
      mctx.textBaseline = 'middle';
      mctx.font = `bold 13px 'Press Start 2P', monospace`;
      mctx.fillStyle = '#000';
      for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) {
        mctx.fillText('\u2665 PRINCESS RESCUED! \u2665', peachX + dx, peachBaseY + bounce + dy);
      }
      mctx.fillStyle = '#ff69b4';
      mctx.fillText('\u2665 PRINCESS RESCUED! \u2665', peachX, peachBaseY + bounce);
      const t2 = (PEACH_CELEB_MS - peachCelebTimer) / 1000;
      for (let i = 0; i < 8; i++) {
        const hx = peachX + Math.sin(t2 * 1.5 + i * 0.8) * 60 + (i - 4) * 18;
        const hy = peachBaseY + 30 - t2 * 60 + Math.sin(t2 * 2 + i) * 10;
        mctx.font = '18px serif';
        mctx.globalAlpha = Math.max(0, Math.min(1, fadeAlpha)) * (1 - Math.min(1, t2 / 2));
        mctx.fillText('\u2665', hx, hy);
      }
      mctx.restore();
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
      if (celebrationTimer > 0) celebrationTimer = Math.max(0, celebrationTimer - delta);
      if (peachCelebTimer > 0) peachCelebTimer = Math.max(0, peachCelebTimer - delta);
      if (starmanTimer > 0) starmanTimer = Math.max(0, starmanTimer - delta);
      if (bonusPopupTimer > 0) bonusPopupTimer -= delta;

      // Goomba sweep countdown
      if (!gameOver) {
        goombaSweepTimer -= delta;
        if (goombaSweepTimer <= 0) {
          tryStartGoomba();
          goombaSweepTimer = (goombaSweepInterval[difficulty] || 60000) + Math.random() * 15000;
        }
        if (goomba !== null) {
          goomba.x += delta * (COLS + 3) / 2500;
          if (goomba.x >= COLS + 1) {
            grid[goomba.row] = Array(COLS).fill(null);
            const cfg = DIFFICULTIES[difficulty];
            score += Math.round(200 * level * cfg.scoreMult);
            updateHud();
            window.GameAudio && GameAudio.sfxLine();
            updatePeachProgress(1);
            goomba = null;
          }
        }
      }

      const effectiveDropInterval = starmanTimer > 0 ? 60 : dropInterval;

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
        if (dropCounter > effectiveDropInterval) {
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
  renderLeaderboard();
  requestAnimationFrame(loop);
})();
