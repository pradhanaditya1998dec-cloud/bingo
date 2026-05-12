// lib/tambola.js
//
// Sheet generation algorithm ported from:
//   github.com/harinderseera/tambola-ticket-generator (Java)
// Generalized to support any sheetSize (not just 6).

// ── Column ranges ─────────────────────────────────────────
const COL_RANGES = [
  { min: 1,  max: 9  }, // col 0:  9 numbers
  { min: 10, max: 19 }, // col 1: 10 numbers
  { min: 20, max: 29 }, // col 2: 10 numbers
  { min: 30, max: 39 }, // col 3: 10 numbers
  { min: 40, max: 49 }, // col 4: 10 numbers
  { min: 50, max: 59 }, // col 5: 10 numbers
  { min: 60, max: 69 }, // col 6: 10 numbers
  { min: 70, max: 79 }, // col 7: 10 numbers
  { min: 80, max: 90 }, // col 8: 11 numbers
];

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getRand(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function getSetTotal(set) {
  return set.reduce((sum, col) => sum + col.length, 0);
}

function countFilledInRow(grid, row) {
  return grid[row].filter(n => n !== 0).length;
}

function generateSheet(sheetSize) {
  const columns = COL_RANGES.map(({ min, max }) => {
    const nums = [];
    for (let n = min; n <= max; n++) nums.push(n);
    return shuffle(nums);
  });

  const sets = Array.from({ length: sheetSize }, () =>
    Array.from({ length: 9 }, () => [])
  );

  // Phase 1: Seed
  for (let c = 0; c < 9; c++) {
    for (let t = 0; t < sheetSize; t++) {
      if (columns[c].length === 0) break;
      const idx = getRand(0, columns[c].length - 1);
      sets[t][c].push(columns[c].splice(idx, 1)[0]);
    }
  }

  // Phases 2 & 3: Fill
  for (let maxColSize = 2; maxColSize <= 3; maxColSize++) {
    for (let c = 0; c < 9; c++) {
      while (columns[c].length > 0) {
        const eligible = [];
        for (let t = 0; t < sheetSize; t++) {
          if (getSetTotal(sets[t]) < 15 && sets[t][c].length < maxColSize) {
            eligible.push(t);
          }
        }
        if (eligible.length === 0) break;
        const idx = getRand(0, columns[c].length - 1);
        const num = columns[c].splice(idx, 1)[0];
        const t = eligible[getRand(0, eligible.length - 1)];
        sets[t][c].push(num);
      }
    }
  }

  // Validate
  for (let t = 0; t < sheetSize; t++) {
    if (getSetTotal(sets[t]) !== 15) return null;
    for (let c = 0; c < 9; c++) {
      const len = sets[t][c].length;
      if (len < 1 || len > 3) return null;
    }
    for (let c = 0; c < 9; c++) sets[t][c].sort((a, b) => a - b);
  }

  // Phase 4: Build grids
  const grids = [];
  for (let t = 0; t < sheetSize; t++) {
    const remaining = sets[t].map(col => [...col]);
    const grid = Array.from({ length: 3 }, () => Array(9).fill(0));

    for (let row = 0; row < 3; row++) {
      for (let preferSize = 3; preferSize >= 1; preferSize--) {
        if (countFilledInRow(grid, row) === 5) break;
        const colOrder = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]);
        for (const c of colOrder) {
          if (countFilledInRow(grid, row) === 5) break;
          if (grid[row][c] !== 0) continue;
          if (remaining[c].length !== preferSize) continue;
          grid[row][c] = remaining[c].shift();
        }
      }
    }

    for (let r = 0; r < 3; r++) {
      if (countFilledInRow(grid, r) !== 5) return null;
    }
    grids.push(grid);
  }

  return grids;
}

// ── Pool-aware fallback ───────────────────────────────────
//
// The original generateFallbackTicket() drew from the full number pool
// independently for every ticket, so two fallback tickets in the same
// sheet could end up with the same number.
//
// The fix: build ONE shared column pool per sheet at the start, then
// draw from (and destructively remove from) that pool for each fallback
// ticket in the sheet. Since each number is removed once drawn, it
// cannot appear on a second ticket in the same sheet.

function buildSharedColumnPools() {
  return COL_RANGES.map(({ min, max }) => {
    const nums = [];
    for (let n = min; n <= max; n++) nums.push(n);
    return shuffle(nums);
  });
}

/**
 * Generate one fallback ticket drawing from shared column pools.
 * Numbers drawn are spliced out of the pools so they won't be reused
 * by subsequent tickets sharing the same pools (i.e. the same sheet).
 *
 * Returns a 3×9 grid, or null if balancing fails.
 */
function generateFallbackTicketFromPool(columnPools) {
  // Decide how many numbers to take from each column (1 or 2).
  const colCounts = [];
  let total = 0;

  for (let c = 0; c < 9; c++) {
    const available = columnPools[c].length;
    if (available === 0) {
      colCounts.push(0);
    } else if (available === 1) {
      colCounts.push(1);
      total += 1;
    } else {
      const take = getRand(1, 2);
      colCounts.push(take);
      total += take;
    }
  }

  // Adjust total to exactly 15.
  let attempts = 0;
  while (total < 15 && attempts < 100) {
    const c = getRand(0, 8);
    if (colCounts[c] < 2 && columnPools[c].length >= 2) {
      colCounts[c]++;
      total++;
    }
    attempts++;
  }
  attempts = 0;
  while (total > 15 && attempts < 100) {
    const c = getRand(0, 8);
    if (colCounts[c] > 1) {
      colCounts[c]--;
      total--;
    }
    attempts++;
  }

  if (total !== 15) return null;

  // Draw numbers from pools (destructive — removes them so they can't repeat).
  const chosen = [];
  for (let c = 0; c < 9; c++) {
    const take = colCounts[c];
    if (take === 0) { chosen.push([]); continue; }
    if (columnPools[c].length < take) return null;
    const nums = [];
    for (let i = 0; i < take; i++) {
      const idx = getRand(0, columnPools[c].length - 1);
      nums.push(columnPools[c].splice(idx, 1)[0]);
    }
    nums.sort((a, b) => a - b);
    chosen.push(nums);
  }

  // Place into a 3×9 grid with exactly 5 filled cells per row.
  const grid = Array.from({ length: 3 }, () => Array(9).fill(0));
  const remaining = chosen.map(col => [...col]);

  for (let row = 0; row < 3; row++) {
    for (let preferSize = 2; preferSize >= 1; preferSize--) {
      if (countFilledInRow(grid, row) === 5) break;
      const colOrder = shuffle([0, 1, 2, 3, 4, 5, 6, 7, 8]);
      for (const c of colOrder) {
        if (countFilledInRow(grid, row) === 5) break;
        if (grid[row][c] !== 0) continue;
        if (remaining[c].length !== preferSize) continue;
        grid[row][c] = remaining[c].shift();
      }
    }
  }

  for (let r = 0; r < 3; r++) {
    if (countFilledInRow(grid, r) !== 5) return null;
  }

  return grid;
}

/**
 * Truly independent fallback — absolute last resort only.
 * Does NOT share a pool, so use only when the pool-aware path fails.
 */
function generateIndependentFallbackTicket() {
  while (true) {
    const grid = Array.from({ length: 3 }, () => Array(9).fill(0));
    for (let c = 0; c < 9; c++) {
      const { min, max } = COL_RANGES[c];
      const pool = shuffle([...Array(max - min + 1)].map((_, i) => i + min));
      const count = 1 + Math.floor(Math.random() * 2);
      const rows = shuffle([0, 1, 2]).slice(0, count).sort((a, b) => a - b);
      const nums = pool.slice(0, count).sort((a, b) => a - b);
      rows.forEach((r, i) => { grid[r][c] = nums[i]; });
    }
    const rowCounts = grid.map(row => row.filter(n => n !== 0).length);
    if (rowCounts.every(c => c === 5)) return grid;
  }
}

// ── Public API ────────────────────────────────────────────

function flattenGrid(grid) {
  return grid.flat();
}

export function reconstructGrid(flat) {
  return [flat.slice(0, 9), flat.slice(9, 18), flat.slice(18, 27)];
}

export function generateTickets(count = 50, sheetSize = 6) {
  const effectiveSheetSize = Math.min(sheetSize, 9);
  const tickets = [];
  let ticketIndex = 0;
  const totalSheets = Math.ceil(count / effectiveSheetSize);

  for (let s = 0; s < totalSheets; s++) {
    const thisSheetSize = Math.min(effectiveSheetSize, count - s * effectiveSheetSize);

    // Try the primary sheet generator (inherently no-repeat within a sheet).
    let grids = null;
    for (let attempt = 0; attempt < 30; attempt++) {
      grids = generateSheet(thisSheetSize);
      if (grids !== null) break;
    }

    if (grids !== null) {
      for (const grid of grids) {
        tickets.push({
          id: `T${ticketIndex + 1}`,
          numbers: flattenGrid(grid),
          status: "free",
          bookedBy: null,
          userName: null,
          userPhone: null,
        });
        ticketIndex++;
      }
    } else {
      // Primary generator failed. Use pool-aware fallback so numbers still
      // don't repeat within this sheet.
      console.warn(`Sheet ${s + 1}: primary generation failed after 30 attempts, using pool-aware fallback.`);

      // One shared pool for the entire sheet — drawn from destructively.
      const columnPools = buildSharedColumnPools();

      for (let t = 0; t < thisSheetSize; t++) {
        let grid = null;
        for (let attempt = 0; attempt < 30; attempt++) {
          grid = generateFallbackTicketFromPool(columnPools);
          if (grid !== null) break;
        }

        if (grid === null) {
          // Pool-aware fallback also failed (shouldn't happen for sheetSize ≤ 9).
          console.warn(`Sheet ${s + 1}, ticket ${t + 1}: pool-aware fallback failed; using independent ticket.`);
          grid = generateIndependentFallbackTicket();
        }

        tickets.push({
          id: `T${ticketIndex + 1}`,
          numbers: flattenGrid(grid),
          status: "free",
          bookedBy: null,
          userName: null,
          userPhone: null,
        });
        ticketIndex++;
      }
    }
  }

  return tickets;
}

/** @deprecated Use generateTickets(50) instead. */
export function generate50Tickets() {
  return generateTickets(50, 6);
}

// export function checkWinners(flatNumbers, calledNumbers) {
//   const called = new Set(calledNumbers);
//   const grid = reconstructGrid(flatNumbers);
//   const checkRow = (row) => row.filter(n => n !== 0).every(n => called.has(n));
//   const topLine    = checkRow(grid[0]);
//   const middleLine = checkRow(grid[1]);
//   const lastLine   = checkRow(grid[2]);
//   return { topLine, middleLine, lastLine, fullHouse: topLine && middleLine && lastLine };
// }


export function checkWinners(flatNumbers, calledNumbers) {
  const called = new Set(calledNumbers);
  const grid = reconstructGrid(flatNumbers);
  const checkRow = (row) => row.filter(n => n !== 0).every(n => called.has(n));
  const topLine    = checkRow(grid[0]);
  const middleLine = checkRow(grid[1]);
  const lastLine   = checkRow(grid[2]);

  // Quick 7: at least 7 numbers on this ticket have been called
  const allNums = flatNumbers.filter(n => n !== 0);
  const quickSeven = allNums.filter(n => called.has(n)).length >= 7;

  return { topLine, middleLine, lastLine, quickSeven, fullHouse: topLine && middleLine && lastLine };
}

export function generateGameId() {
  const now = new Date();
  const y   = now.getFullYear();
  const mo  = String(now.getMonth() + 1).padStart(2, "0");
  const d   = String(now.getDate()).padStart(2, "0");
  const h   = String(now.getHours()).padStart(2, "0");
  const m   = String(now.getMinutes()).padStart(2, "0");
  return `${y}-${mo}-${d}_${h}-${m}`;
}

export function formatGameId(gameId) {
  if (!gameId) return "";
  const [datePart, timePart] = gameId.split("_");
  
  // Parse date parts directly to avoid UTC shift
  const [y, m, d] = datePart.split("-").map(Number);
  const dateStr = new Date(y, m - 1, d).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
  });

  if (!timePart) return dateStr;
  const [h, mn] = timePart.split("-").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${dateStr} · ${hour}:${String(mn).padStart(2, "0")} ${ampm}`;
}

/** @deprecated Use generateGameId() instead. */
export function getTodayGameId() {
  return generateGameId();
}


export { announceNumber, preloadAudio, initAudio } from "./audioManager";

export const WIN_TYPES = ["topLine", "middleLine", "lastLine", "quickSeven", "fullHouse"];
export const WIN_LABELS = {
  topLine:    "🎯 Top Line",
  middleLine: "🎯 Middle Line",
  lastLine:   "🎯 Last Line",
  quickSeven: "⚡ Quick 7",
  fullHouse:  "🏆 Full House",
};