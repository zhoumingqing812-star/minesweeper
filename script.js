const boardElement = document.getElementById("board");
const boardWrapper = document.querySelector(".board-wrapper");
const appElement = document.querySelector(".app");
const form = document.getElementById("config-form");
const widthInput = document.getElementById("width-input");
const heightInput = document.getElementById("height-input");
const mineInput = document.getElementById("mine-input");
const mineCounter = document.getElementById("mine-counter");
const timerLabel = document.getElementById("timer");
const messageLabel = document.getElementById("game-message");

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const CELL_GAP = 4;
const MIN_CELL_SIZE = 20;
const MAX_CELL_SIZE = 36;
const DEFAULT_WIDTH = 9;
const DEFAULT_HEIGHT = 9;

const getAvailableBoardWidth = () => {
  const wrapperWidth = boardWrapper?.clientWidth ?? 0;
  const appWidth = appElement?.clientWidth ?? 0;
  const fallback = window.innerWidth || 320;
  const baseWidth = Math.max(wrapperWidth, appWidth, fallback);
  return Math.max(baseWidth - 32, 200); // subtract wrapper padding
};

const computeCellSize = (columns) => {
  const availableWidth = getAvailableBoardWidth();
  const totalGap = CELL_GAP * (columns - 1);
  const usableWidth = Math.max(availableWidth - totalGap, MIN_CELL_SIZE * columns);
  const size = Math.floor(usableWidth / columns);
  return clamp(size, MIN_CELL_SIZE, MAX_CELL_SIZE);
};

const applyCellSize = (columns) => {
  const size = computeCellSize(columns);
  boardElement.style.setProperty("--cell-size", `${size}px`);
  boardElement.style.setProperty(
    "grid-template-columns",
    `repeat(${columns}, var(--cell-size))`
  );
};

const recommendMines = (width, height) => {
  const total = width * height;
  const density = total <= 100 ? 0.15 : total <= 300 ? 0.17 : 0.2;
  return clamp(Math.round(total * density), 1, total - 1);
};

const DEFAULT_MINES = recommendMines(DEFAULT_WIDTH, DEFAULT_HEIGHT);

let state = {
  width: DEFAULT_WIDTH,
  height: DEFAULT_HEIGHT,
  mines: DEFAULT_MINES,
  board: [],
  mineLeft: DEFAULT_MINES,
  revealedSafe: 0,
  gameOver: false,
  started: false,
  timerId: null,
  startTime: null,
};

function init() {
  let mineInputDirty = false;

  widthInput.value = `${state.width}`;
  heightInput.value = `${state.height}`;
  mineInput.value = `${state.mines}`;

  const updateMineSuggestion = () => {
    const nextWidth = clamp(parseInt(widthInput.value, 10) || state.width, 5, 30);
    const nextHeight = clamp(parseInt(heightInput.value, 10) || state.height, 5, 30);
    const suggestion = recommendMines(nextWidth, nextHeight);
    mineInput.placeholder = `${suggestion}`;

    const trimmed = mineInput.value.trim();
    const current = parseInt(trimmed, 10);
    const invalid =
      trimmed === "" ||
      Number.isNaN(current) ||
      current <= 0 ||
      current >= nextWidth * nextHeight;

    if (!mineInputDirty || invalid) {
      mineInput.value = `${suggestion}`;
      mineInputDirty = false;
    }
  };

  ["input", "change"].forEach((eventName) => {
    widthInput.addEventListener(eventName, updateMineSuggestion);
    heightInput.addEventListener(eventName, updateMineSuggestion);
  });

  const handleMineInputChange = () => {
    mineInputDirty = mineInput.value.trim() !== "";
    if (!mineInputDirty) {
      updateMineSuggestion();
    }
  };

  ["input", "change"].forEach((eventName) => {
    mineInput.addEventListener(eventName, handleMineInputChange);
  });

  updateMineSuggestion();

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const nextWidth = clamp(parseInt(widthInput.value, 10) || 9, 5, 30);
    const nextHeight = clamp(parseInt(heightInput.value, 10) || 9, 5, 30);
    const totalCells = nextWidth * nextHeight;
    const nextMines = clamp(parseInt(mineInput.value, 10) || 10, 1, totalCells - 1);
    startNewGame(nextWidth, nextHeight, nextMines);
  });

  boardElement.addEventListener("contextmenu", (event) => event.preventDefault());

  startNewGame(state.width, state.height, state.mines);
}

function startNewGame(width, height, mines) {
  stopTimer();
  state = {
    ...state,
    width,
    height,
    mines,
    mineLeft: mines,
    revealedSafe: 0,
    started: false,
    gameOver: false,
    board: [],
    timerId: null,
    startTime: null,
  };
  messageLabel.textContent = "";
  applyCellSize(width);
  boardElement.innerHTML = "";
  state.board = buildBoard(width, height, mines);
  updateMineCounter();
  timerLabel.textContent = "⏱ 0.0s";
}

function buildBoard(width, height, mines) {
  const board = [];
  const cells = [];

  for (let row = 0; row < height; row++) {
    const rowArr = [];
    for (let col = 0; col < width; col++) {
      const cell = {
        row,
        col,
        mine: false,
        flagged: false,
        revealed: false,
        adjacent: 0,
        element: createCellElement(row, col),
      };
      rowArr.push(cell);
      cells.push(cell);
    }
    board.push(rowArr);
  }

  placeMines(cells, mines);
  computeNumbers(board);
  return board;
}

function createCellElement(row, col) {
  const cell = document.createElement("button");
  cell.className = "cell";
  cell.setAttribute("data-row", row);
  cell.setAttribute("data-col", col);
  cell.setAttribute("aria-label", "未翻开的格子");
  cell.type = "button";
  cell.addEventListener("click", () => handleReveal(row, col));
  cell.addEventListener("contextmenu", (event) => {
    event.preventDefault();
    handleFlag(row, col);
  });
  cell.addEventListener("dblclick", () => handleChord(row, col));
  boardElement.appendChild(cell);
  return cell;
}

function placeMines(cells, mines) {
  const total = cells.length;
  const indexes = Array.from({ length: total }, (_, i) => i);
  shuffle(indexes);

  for (let i = 0; i < mines; i++) {
    cells[indexes[i]].mine = true;
  }
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

function computeNumbers(board) {
  for (const row of board) {
    for (const cell of row) {
      if (cell.mine) {
        cell.adjacent = -1;
        continue;
      }
      cell.adjacent = getNeighbors(board, cell.row, cell.col).filter((c) => c.mine).length;
    }
  }
}

function getNeighbors(board, row, col) {
  const result = [];
  for (let r = row - 1; r <= row + 1; r++) {
    for (let c = col - 1; c <= col + 1; c++) {
      if (r === row && c === col) continue;
      if (board[r] && board[r][c]) {
        result.push(board[r][c]);
      }
    }
  }
  return result;
}

function handleReveal(row, col) {
  if (state.gameOver) return;
  const cell = state.board[row][col];
  if (cell.revealed || cell.flagged) return;

  if (!state.started) {
    state.started = true;
    ensureSafeFirstClick(cell);
    startTimer();
  }

  revealCell(cell);
}

function ensureSafeFirstClick(firstCell) {
  const flat = state.board.flat();
  const neighbors = getNeighbors(state.board, firstCell.row, firstCell.col);
  const safeZone = [firstCell, ...neighbors];
  const canGuaranteeSafeZone = state.mines <= flat.length - safeZone.length;
  const needsRelayout = firstCell.mine || (canGuaranteeSafeZone && firstCell.adjacent > 0);

  if (!needsRelayout) return;

  const allowedCells = canGuaranteeSafeZone
    ? flat.filter((cell) => !safeZone.includes(cell))
    : flat;

  const relayout = () => {
    flat.forEach((cell) => {
      cell.mine = false;
      cell.adjacent = 0;
    });
    shuffle(allowedCells);
    for (let i = 0; i < state.mines; i++) {
      allowedCells[i].mine = true;
    }
    computeNumbers(state.board);
  };

  if (canGuaranteeSafeZone) {
    relayout();
    return;
  }

  let attempts = 0;
  do {
    relayout();
    attempts += 1;
  } while (firstCell.mine && attempts < 100);

  if (firstCell.mine) {
    const replacement = flat.find((cell) => !cell.mine);
    if (replacement) {
      replacement.mine = true;
      firstCell.mine = false;
      computeNumbers(state.board);
    }
  }
}

function revealCell(cell) {
  if (cell.revealed || cell.flagged) return;
  cell.revealed = true;
  cell.element.classList.add("revealed");
  cell.element.setAttribute("aria-label", "已翻开");

  if (cell.mine) {
    cell.element.classList.add("mine");
    cell.element.textContent = "";
    cell.element.dataset.content = "💣";
    endGame(false);
    return;
  }

  state.revealedSafe += 1;

  if (cell.adjacent > 0) {
    cell.element.textContent = cell.adjacent;
    cell.element.classList.add(`number-${cell.adjacent}`);
  } else {
    cell.element.textContent = "";
    getNeighbors(state.board, cell.row, cell.col).forEach(revealCell);
  }

  checkWin();
}

function handleFlag(row, col) {
  if (state.gameOver) return;
  const cell = state.board[row][col];
  if (cell.revealed) return;

  cell.flagged = !cell.flagged;
  cell.element.classList.toggle("flagged", cell.flagged);
  state.mineLeft += cell.flagged ? -1 : 1;
  updateMineCounter();
}

function handleChord(row, col) {
  if (state.gameOver) return;
  const cell = state.board[row][col];
  if (!cell.revealed || cell.adjacent <= 0) return;
  const neighbors = getNeighbors(state.board, row, col);
  const flagged = neighbors.filter((c) => c.flagged).length;
  if (flagged === cell.adjacent) {
    neighbors.forEach((neighbor) => {
      if (!neighbor.flagged) revealCell(neighbor);
    });
  }
}

function updateMineCounter() {
  mineCounter.textContent = `💣 ${state.mineLeft}`;
}

function checkWin() {
  const totalSafe = state.width * state.height - state.mines;
  if (state.revealedSafe === totalSafe) {
    endGame(true);
  }
}

function endGame(win) {
  state.gameOver = true;
  stopTimer();
  messageLabel.textContent = win ? "🎉 胜利！" : "💥 爆炸了！";
  if (!win) {
    revealAllMines();
  } else {
    autoFlagRemaining();
  }
}

function revealAllMines() {
  state.board.flat().forEach((cell) => {
    if (cell.mine) {
      cell.element.classList.add("mine", "revealed");
    }
  });
}

function autoFlagRemaining() {
  state.board.flat().forEach((cell) => {
    if (cell.mine && !cell.flagged) {
      cell.flagged = true;
      cell.element.classList.add("flagged");
    }
  });
  state.mineLeft = 0;
  updateMineCounter();
}

function startTimer() {
  state.startTime = performance.now();
  timerLabel.textContent = "⏱ 0.0s";
  state.timerId = setInterval(() => {
    const elapsed = (performance.now() - state.startTime) / 1000;
    timerLabel.textContent = `⏱ ${elapsed.toFixed(1)}s`;
  }, 100);
}

function stopTimer() {
  if (state.timerId) {
    clearInterval(state.timerId);
  }
  state.timerId = null;
}

const minesweeperApi = {
  startNewGame,
  getState: () => state,
  reveal: (row, col) => handleReveal(row, col),
  flag: (row, col) => handleFlag(row, col),
  chord: (row, col) => handleChord(row, col),
};

if (typeof window !== "undefined") {
  window.minesweeper = minesweeperApi;
  window.addEventListener("resize", () => {
    applyCellSize(state.width);
  });
}

init();

