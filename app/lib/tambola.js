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

  const firstRow = grid[0].filter(n => n !== 0);
  const lastRow = grid[2].filter(n => n !== 0);
  const corners = [firstRow[0], firstRow[firstRow.length - 1], lastRow[0], lastRow[lastRow.length - 1]]
    .every(n => called.has(n));

  // Quick 7: at least 7 numbers on this ticket have been called
  const allNums = flatNumbers.filter(n => n !== 0);
  const quickSeven = allNums.filter(n => called.has(n)).length >= 7;

  const fullHouse = topLine && middleLine && lastLine;

  return { topLine, middleLine, lastLine, corners, quickSeven, fullHouse, secondFullHouse: fullHouse };
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

export const WIN_TYPES = ["topLine", "middleLine", "lastLine", "corners", "quickSeven", "fullHouse", "secondFullHouse"];
export const WIN_LABELS = {
  topLine:    "🎯 Top Line",
  middleLine: "🎯 Middle Line",
  lastLine:   "🎯 Last Line",
  corners:    "🔶 Corners",
  quickSeven: "⚡ Quick 7",
  fullHouse:  "🏆 Full House",
  secondFullHouse: "🏆 2nd Full House",
};

export function formatGameTime(startedAt, gameId) {
  if (startedAt) {
    const d = new Date(startedAt);
    const dateStr = d.toLocaleDateString("en-IN", {
      day: "numeric", month: "short", year: "numeric",
    });
    const h = d.getHours();
    const mn = d.getMinutes();
    const ampm = h >= 12 ? "PM" : "AM";
    const hour = h % 12 || 12;
    return `${dateStr} · ${hour}:${String(mn).padStart(2, "0")} ${ampm}`;
  }
  return formatGameId(gameId);
}

export function getSharedNumbers(tickets, ticketIds, winType) {
  if (ticketIds.length <= 1) return [];
  
  function getCategoryNumbers(ticket) {
    const rows = reconstructGrid(ticket.numbers);
    if (winType === "topLine") return rows[0].filter(n => n > 0);
    if (winType === "middleLine") return rows[1].filter(n => n > 0);
    if (winType === "lastLine") return rows[2].filter(n => n > 0);
    if (winType === "corners") {
      const corners = [];
      const r0 = rows[0].filter(n => n > 0);
      const r2 = rows[2].filter(n => n > 0);
      if (r0.length) { corners.push(r0[0], r0[r0.length - 1]); }
      if (r2.length) { corners.push(r2[0], r2[r2.length - 1]); }
      return corners;
    }
    return rows.flat().filter(n => n > 0);
  }

  const sets = ticketIds.map(id => {
    const ticket = tickets[id];
    return ticket ? new Set(getCategoryNumbers(ticket)) : new Set();
  });

  let intersection = [...sets[0]];
  for (let i = 1; i < sets.length; i++) {
    intersection = intersection.filter(n => sets[i].has(n));
  }
  return intersection;
}

function tryGenerateRiggedSequence(tickets, riggedMap, enabledRules) {
  const seq = [];
  const remaining = new Set(Array.from({ length: 90 }, (_, i) => i + 1));

  // Helper to get numbers for a category on a ticket
  function getRequiredNumbers(ticket, winType) {
    const rows = reconstructGrid(ticket.numbers);
    if (winType === "topLine") return rows[0].filter(n => n > 0);
    if (winType === "middleLine") return rows[1].filter(n => n > 0);
    if (winType === "lastLine") return rows[2].filter(n => n > 0);
    if (winType === "corners") {
      const corners = [];
      const r0 = rows[0].filter(n => n > 0);
      const r2 = rows[2].filter(n => n > 0);
      if (r0.length) { corners.push(r0[0], r0[r0.length - 1]); }
      if (r2.length) { corners.push(r2[0], r2[r2.length - 1]); }
      return corners;
    }
    if (winType === "quickSeven") {
      return rows.flat().filter(n => n > 0).slice(0, 7);
    }
    if (winType === "fullHouse" || winType === "secondFullHouse") {
      return rows.flat().filter(n => n > 0);
    }
    return [];
  }

  const order = ["quickSeven", "corners", "topLine", "middleLine", "lastLine", "fullHouse", "secondFullHouse"];
  
  // Flatten riggedMap to sequential or grouped steps
  const steps = [];
  
  order.forEach(winType => {
    const val = riggedMap[winType];
    if (!val) return;
    
    // Normalize to array of ticket IDs
    const tIds = Array.isArray(val) ? val.filter(Boolean) : [val].filter(Boolean);
    if (tIds.length === 0) return;
    
    // If only 1 ticket, process as a simple step
    if (tIds.length === 1) {
      steps.push({ winType, ticketIds: tIds, sharedTrigger: null });
      return;
    }
    
    // Check if they share a number in this category
    const shared = getSharedNumbers(tickets, tIds, winType);
    if (shared.length > 0) {
      // They share a number, so they can win together in a single step!
      steps.push({ winType, ticketIds: tIds, sharedTrigger: shared[0] });
    } else {
      // They do not share a number, so they win sequentially
      tIds.forEach(id => {
        steps.push({ winType, ticketIds: [id], sharedTrigger: null });
      });
    }
  });

  if (steps.length === 0) {
    // No rigging configured: return random 1-90
    return Array.from({ length: 90 }, (_, i) => i + 1).sort(() => Math.random() - 0.5);
  }

  steps.forEach((step, index) => {
    const { winType, ticketIds, sharedTrigger } = step;
    
    // Collect union of required numbers
    const allReqs = new Set();
    ticketIds.forEach(id => {
      const t = tickets[id];
      if (t) {
        getRequiredNumbers(t, winType).forEach(n => allReqs.add(n));
      }
    });
    
    const reqNums = Array.from(allReqs);
    // Find missing numbers not yet in seq
    const missing = reqNums.filter(n => !seq.includes(n));
    if (missing.length === 0) return; // already satisfied

    // Determine target index for the winning call of this category step
    const stepGap = 5 + Math.floor(Math.random() * 6); // random gap of 5 to 10 draws
    let targetIndex = seq.length + stepGap;
    
    if (index === 0) {
      // First winner: must be at least at draw 25-32
      const randomStart = 25 + Math.floor(Math.random() * 8);
      targetIndex = Math.max(targetIndex, randomStart);
    }
    
    if (winType === "fullHouse" || winType === "secondFullHouse") {
      // Full house: must be at least at draw 70-78
      const randomFullHouse = 70 + Math.floor(Math.random() * 9);
      targetIndex = Math.max(targetIndex, randomFullHouse);
    }

    // Determine the trigger number
    let lastNum;
    if (sharedTrigger && missing.includes(sharedTrigger)) {
      lastNum = sharedTrigger;
    } else {
      const shuffledMissing = [...missing].sort(() => Math.random() - 0.5);
      lastNum = shuffledMissing[shuffledMissing.length - 1];
    }
    
    const otherReqs = missing.filter(n => n !== lastNum);

    // Number of random spacing calls we need to insert before the winning trigger
    let randomCount = targetIndex - seq.length - otherReqs.length - 1;
    if (randomCount < 0) randomCount = 0;

    // Pick random numbers that do not trigger subsequent steps prematurely
    const reservedNums = new Set([lastNum, ...otherReqs]);
    steps.slice(index + 1).forEach(subStep => {
      subStep.ticketIds.forEach(id => {
        const t = tickets[id];
        if (t) {
          getRequiredNumbers(t, subStep.winType).forEach(n => reservedNums.add(n));
        }
      });
    });

    const candidates = Array.from(remaining).filter(n => !reservedNums.has(n));
    const shuffledCandidates = [...candidates].sort(() => Math.random() - 0.5);

    // Pull randomCount numbers from candidates
    const pulledRandom = [];
    for (let i = 0; i < Math.min(randomCount, shuffledCandidates.length); i++) {
      const num = shuffledCandidates[i];
      pulledRandom.push(num);
      remaining.delete(num);
    }

    // Mix the required numbers (except the trigger) and random spacing numbers randomly
    const preMix = [...otherReqs, ...pulledRandom].sort(() => Math.random() - 0.5);
    
    // Add mixed numbers to the sequence
    preMix.forEach(num => {
      seq.push(num);
      remaining.delete(num);
    });

    // Finally, push the lastNum (the trigger)
    seq.push(lastNum);
    remaining.delete(lastNum);
  });

  // Fill in any remaining numbers randomly
  const left = Array.from(remaining).sort(() => Math.random() - 0.5);
  seq.push(...left);

  return seq;
}

export function generateRiggedSequence(tickets, riggedMap, enabledRules) {
  const booked = Object.values(tickets).filter(t => t.status === "booked");
  const order = ["quickSeven", "corners", "topLine", "middleLine", "lastLine", "fullHouse", "secondFullHouse"];

  const checkRow = (row, called) => row.filter(n => n !== 0).every(n => called.has(n));
  function checkTicketWins(ticket, called) {
    const grid = reconstructGrid(ticket.numbers);
    const topLine = checkRow(grid[0], called);
    const middleLine = checkRow(grid[1], called);
    const lastLine = checkRow(grid[2], called);
    const firstRow = grid[0].filter(n => n !== 0);
    const lastRow = grid[2].filter(n => n !== 0);
    const corners = [firstRow[0], firstRow[firstRow.length - 1], lastRow[0], lastRow[lastRow.length - 1]].every(n => called.has(n));
    const allNums = ticket.numbers.filter(n => n !== 0);
    const quickSeven = allNums.filter(n => called.has(n)).length >= 7;
    const fullHouse = topLine && middleLine && lastLine;
    return { topLine, middleLine, lastLine, corners, quickSeven, fullHouse, secondFullHouse: fullHouse };
  }

  for (let attempt = 0; attempt < 50; attempt++) {
    const seq = tryGenerateRiggedSequence(tickets, riggedMap, enabledRules);
    
    // Validate if any non-rigged ticket accidentally wins BEFORE/WITH the rigged tickets
    let isValid = true;
    const called = new Set();
    const firstWinCallOfCategory = {};
    const firstWinnersOfCategory = {};

    for (let i = 0; i < seq.length; i++) {
      called.add(seq[i]);
      for (const ticket of booked) {
        const wins = checkTicketWins(ticket, called);
        Object.entries(wins).forEach(([winType, didWin]) => {
          if (!didWin) return;
          if (!firstWinCallOfCategory[winType]) {
            firstWinCallOfCategory[winType] = i + 1;
            firstWinnersOfCategory[winType] = new Set([ticket.id]);
          } else if (firstWinCallOfCategory[winType] === i + 1) {
            firstWinnersOfCategory[winType].add(ticket.id);
          }
        });
      }
    }

    // Check categories
    for (const winType of order) {
      if (!enabledRules[winType] && winType !== "fullHouse") continue;
      
      const targetIds = riggedMap[winType] 
        ? (Array.isArray(riggedMap[winType]) ? riggedMap[winType] : [riggedMap[winType]])
        : [];
      
      if (targetIds.length > 0) {
        const actualWinners = firstWinnersOfCategory[winType] || new Set();
        // 1. Every target ticket must have won
        const allTargetWon = targetIds.every(id => actualWinners.has(id));
        // 2. No other ticket should have won in this first win call
        const onlyTargetWon = Array.from(actualWinners).every(id => targetIds.includes(id));
        
        if (!allTargetWon || !onlyTargetWon) {
          isValid = false;
          break;
        }
      }
    }

    if (isValid) {
      return seq;
    }
  }

  // Fallback if strict validation fails after 1000 attempts
  return tryGenerateRiggedSequence(tickets, riggedMap, enabledRules);
}


