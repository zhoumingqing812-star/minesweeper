const path = require("path");
const { pathToFileURL } = require("url");
const puppeteer = require("puppeteer");

const htmlUrl = pathToFileURL(path.join(__dirname, "..", "index.html")).href;

const defaultConfig = { width: 6, height: 6, mines: 6 };

const cellSelector = (row, col) => `.cell[data-row="${row}"][data-col="${col}"]`;

async function configureGame(page, config = defaultConfig) {
  const { width, height, mines } = config;
  await page.$eval("#width-input", (el, value) => {
    el.value = value;
  }, width);
  await page.$eval("#height-input", (el, value) => {
    el.value = value;
  }, height);
  await page.$eval("#mine-input", (el, value) => {
    el.value = value;
  }, mines);

  await page.click('#config-form button[type="submit"]');
  await page.waitForFunction(
    (expected) => document.querySelectorAll(".cell").length === expected,
    {},
    width * height
  );
}

async function getBoardData(page) {
  return page.evaluate(() =>
    window.minesweeper
      .getState()
      .board.map((row) =>
        row.map((cell) => ({
          row: cell.row,
          col: cell.col,
          mine: cell.mine,
          adjacent: cell.adjacent,
        }))
      )
  );
}

function getNeighbors(cell, board) {
  const { row, col } = cell;
  const neighbors = [];
  for (let r = row - 1; r <= row + 1; r += 1) {
    for (let c = col - 1; c <= col + 1; c += 1) {
      if (r === row && c === col) continue;
      if (board[r] && board[r][c]) {
        neighbors.push(board[r][c]);
      }
    }
  }
  return neighbors;
}

async function leftClick(page, cell) {
  await page.click(cellSelector(cell.row, cell.col));
}

async function rightClick(page, cell) {
  await page.click(cellSelector(cell.row, cell.col), { button: "right" });
}

async function doubleClick(page, cell) {
  await page.click(cellSelector(cell.row, cell.col), { clickCount: 2 });
}

async function runWinScenario(page) {
  await configureGame(page);
  let board = await getBoardData(page);

  const firstSafe = board.flat().find((cell) => !cell.mine);
  if (!firstSafe) throw new Error("No safe cell found on board");
  await leftClick(page, firstSafe);

  board = await getBoardData(page);
  const numberCell = board.flat().find((cell) => !cell.mine && cell.adjacent > 0);
  if (!numberCell) throw new Error("Failed to locate numbered cell");
  await leftClick(page, numberCell);

  board = await getBoardData(page);
  const neighborMines = getNeighbors(numberCell, board).filter((cell) => cell.mine);
  for (const mineCell of neighborMines) {
    await rightClick(page, mineCell);
  }

  await doubleClick(page, numberCell);

  board = await getBoardData(page);
  for (const cell of board.flat()) {
    if (!cell.mine) {
      await leftClick(page, cell);
    }
  }

  await page.waitForFunction(
    () => document.getElementById("game-message").textContent.includes("胜利"),
    { timeout: 2000 }
  );
}

async function runLoseScenario(page) {
  await configureGame(page);
  let board = await getBoardData(page);
  const starter = board.flat().find((cell) => !cell.mine);
  if (!starter) throw new Error("No safe starter cell found");
  await leftClick(page, starter);

  board = await getBoardData(page);
  const mineCell = board.flat().find((cell) => cell.mine);
  if (!mineCell) throw new Error("No mine found on board");
  await leftClick(page, mineCell);

  await page.waitForFunction(
    () => document.getElementById("game-message").textContent.includes("爆炸"),
    { timeout: 2000 }
  );
}

async function run() {
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.goto(htmlUrl, { waitUntil: "load" });

  try {
    await runWinScenario(page);
    await runLoseScenario(page);
    console.log("✔ 扫雷核心交互通过自动化验证");
  } catch (error) {
    console.error("✖ 扫雷自动化验证失败");
    console.error(error);
    process.exitCode = 1;
  } finally {
    await browser.close();
  }
}

run();

