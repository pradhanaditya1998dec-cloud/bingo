/**
 * sequence-worker.js
 * Browser Web Worker — constraint-based rigged sequence generator.
 *
 * Receives:  { tickets, targets, calls }
 *   tickets  — array of { id, cells (3×9), booking: { name } }
 *   targets  — { quick7?, corners?, top?, middle?, bottom?, full?, secondFull? }
 *              values are ticket-label strings or arrays of strings, e.g. "T1" or ["T1","T5"]
 *   calls    — optional { quick7?: n, ... } override; pass {} to use auto-defaults
 *
 * Progress:  { type: "progress", retry, attempt, total, phase? }
 * Result:    { type: "result", ok, report, generatedCalls, unintendedWinners, error? }
 */

"use strict";

// ─── Rule definitions ─────────────────────────────────────────────────────────

const RULE_ORDER = ["quick7", "corners", "top", "middle", "bottom", "full", "secondFull"];

const RULES = {
  quick7:     { label: "Quick 7",          type: "quick7",   aliases: ["quick7", "quick-7"],            defaultCall: 32 },
  corners:    { label: "Corners",           type: "corners",  aliases: ["corners"],                      defaultCall: 42 },
  top:        { label: "Top Line",          type: "line",     row: 0, aliases: ["top", "topLine"],       defaultCall: 34 },
  middle:     { label: "Middle Line",       type: "line",     row: 1, aliases: ["middle", "middleLine"], defaultCall: 46 },
  bottom:     { label: "Bottom Line",       type: "line",     row: 2, aliases: ["bottom", "lastLine"],   defaultCall: 56 },
  full:       { label: "Full House",        type: "fullRank", rank: 1, aliases: ["full", "fullHouse"],   defaultCall: 77 },
  secondFull: { label: "Second Full House", type: "fullRank", rank: 2, aliases: ["secondFull"],          defaultCall: 82 },
};

// Maps internal key → report key (used in report.targets)
const REPORT_KEYS = {
  quick7: "quick7", corners: "corners",
  top: "topLine", middle: "middleLine", bottom: "bottomLine",
  full: "fullHouse", secondFull: "secondFullHouse",
};

// Maps internal key → rule-id string (used in generatedCalls / unintendedWinners output)
const KEY_TO_RULE_ID = {
  quick7: "quick-7", corners: "corners",
  top: "top-line", middle: "middle-line", bottom: "bottom-line",
  full: "full-house", secondFull: "second-full-house",
};

// Maps rule-id → internal key (reverse of above)
const RULE_ID_TO_KEY = {
  "quick-7": "quick7", corners: "corners",
  "top-line": "top", "middle-line": "middle", "bottom-line": "bottom",
  "full-house": "full", "second-full-house": "secondFull",
};

// ─── Crypto-secure randomInt ───────────────────────────────────────────────────

const _buf = new Uint32Array(256);
let _pos = 256;

function randomInt(limit) {
  if (limit <= 1) return 0;
  const range = 0x100000000;
  const ceiling = range - (range % limit);
  let val;
  do {
    if (_pos >= 256) { self.crypto.getRandomValues(_buf); _pos = 0; }
    val = _buf[_pos++];
  } while (val >= ceiling);
  return val % limit;
}

function pick(items) { return items[randomInt(items.length)]; }

function shuffle(items) {
  const list = [...items];
  for (let i = list.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// ─── Ticket helpers ────────────────────────────────────────────────────────────

function ticketNumber(ticket) {
  return Number(
    String(ticket.id || "").match(/T-(\d+)/i)?.[1] ||
    String(ticket.id || "").match(/\d+/)?.[0] ||
    0
  );
}

function ticketLabel(ticket) { return `T${ticketNumber(ticket)}`; }
function ticketName(ticket)  { return ticket.booking?.name || "Available"; }

function toNum(v) {
  const n = Number(v);
  return Number.isInteger(n) && n >= 1 && n <= 90 ? n : null;
}

function ticketNumbers(ticket) {
  return ticket.cells.flat().map(toNum).filter(v => v != null);
}

function rowNumbers(ticket, rowIndex) {
  return ticket.cells[rowIndex].map(toNum).filter(v => v != null);
}

function cornerNumbers(ticket) {
  return [ticket.cells[0], ticket.cells[2]].flatMap(row => {
    const nums = row.map(toNum).filter(v => v != null);
    if (!nums.length) return [];
    return nums.length === 1 ? [nums[0]] : [nums[0], nums[nums.length - 1]];
  });
}

function categoryNumbers(ticket, cat) {
  const rule = RULES[cat];
  if (!rule) throw new Error(`Unknown category: ${cat}`);
  if (rule.type === "line")    return rowNumbers(ticket, rule.row);
  if (rule.type === "corners") return cornerNumbers(ticket);
  return ticketNumbers(ticket); // quick7, fullRank
}

function createTicketNumbersCache(tickets) {
  const cache = { ticketNumbers: new Map(), categoryNumbers: new Map() };
  for (const t of tickets) {
    const id  = t.id;
    const lbl = ticketLabel(t);
    const nums = t.cells.flat().map(toNum).filter(v => v != null);
    cache.ticketNumbers.set(id, nums);
    cache.ticketNumbers.set(lbl, nums);
    for (const cat of RULE_ORDER) {
      const rule = RULES[cat];
      let catNums;
      if (rule.type === "line")    catNums = t.cells[rule.row].map(toNum).filter(v => v != null);
      else if (rule.type === "corners") catNums = cornerNumbers(t);
      else catNums = nums;
      cache.categoryNumbers.set(`${id}_${cat}`, catNums);
      cache.categoryNumbers.set(`${lbl}_${cat}`, catNums);
    }
  }
  return cache;
}

// ─── Position map & completion ─────────────────────────────────────────────────

function positionMap(sequence) {
  const map = new Map();
  for (let i = 0; i < sequence.length; i++) map.set(sequence[i], i + 1);
  return map;
}

function getCompletionFromNumbers(sequence, numbers) {
  const pos = positionMap(sequence);
  let maxCall = 0;
  for (const n of numbers) {
    const p = pos.get(n);
    if (p == null) return null;
    if (p > maxCall) maxCall = p;
  }
  return { completeAtCall: maxCall, completeNumber: sequence[maxCall - 1] };
}

function getQuick7Completion(sequence, ticket, cache = null) {
  const pos  = positionMap(sequence);
  const nums = cache ? cache.ticketNumbers.get(ticket.id) : ticketNumbers(ticket);
  const calls = [];
  for (const n of nums) {
    const p = pos.get(n);
    if (p != null) calls.push(p);
  }
  if (calls.length < 7) return null;
  calls.sort((a, b) => a - b);
  const completeAtCall = calls[6];
  let completeNumber = null;
  for (const n of nums) {
    if (pos.get(n) === completeAtCall) { completeNumber = n; break; }
  }
  return { completeAtCall, completeNumber };
}

function getRuleCompletion(sequence, ticket, cat, cache = null) {
  if (cat === "quick7") return getQuick7Completion(sequence, ticket, cache);
  const nums = cache
    ? cache.categoryNumbers.get(`${ticket.id}_${cat}`)
    : categoryNumbers(ticket, cat);
  return getCompletionFromNumbers(sequence, nums);
}

function getRanks(tickets, sequence, cat, cache = null) {
  return tickets
    .map((t, i) => {
      const completion = getRuleCompletion(sequence, t, cat, cache);
      return { ticket: ticketLabel(t), name: ticketName(t), ticketIndex: i, ...completion };
    })
    .filter(e => Number.isInteger(e.completeAtCall))
    .sort((a, b) => a.completeAtCall - b.completeAtCall || a.ticketIndex - b.ticketIndex);
}

function getFirstWinners(tickets, sequence, cat, cache = null) {
  const ranks = getRanks(tickets, sequence, cat, cache);
  const first = ranks[0]?.completeAtCall;
  return Number.isInteger(first) ? ranks.filter(e => e.completeAtCall === first) : [];
}

function getFullStageWinners(tickets, sequence, rank, cache = null) {
  const ranks = getRanks(tickets, sequence, "full", cache);
  const calls = [...new Set(ranks.map(e => e.completeAtCall))].sort((a, b) => a - b);
  const stageCall = calls[rank - 1];
  return Number.isInteger(stageCall) ? ranks.filter(e => e.completeAtCall === stageCall) : [];
}

function getRuleWinners(tickets, sequence, spec, cache = null) {
  if (spec.type === "fullRank") return getFullStageWinners(tickets, sequence, spec.rank, cache);
  return getFirstWinners(tickets, sequence, spec.key, cache);
}

function isVerified(tickets, sequence, activeSpecs, cache = null) {
  return activeSpecs.every(spec => {
    const winners = getRuleWinners(tickets, sequence, spec, cache);
    const winnerLabels = new Set(winners.map(w => w.ticket));
    if (!spec.targets.every(t => winnerLabels.has(t))) return false;
    const firstCall = winners[0]?.completeAtCall;
    if (firstCall !== spec.call) return false;
    // Extra check for quick7: no non-target ticket may reach 7 hits by spec.call
    if (spec.type === "quick7") {
      const targetSet = new Set(spec.targets);
      const pos = positionMap(sequence);
      for (const t of tickets) {
        if (targetSet.has(ticketLabel(t))) continue;
        const nums = cache ? cache.ticketNumbers.get(t.id) : ticketNumbers(t);
        let hits = 0;
        for (const n of nums) {
          const p = pos.get(n);
          if (p != null && p <= spec.call) { hits++; if (hits >= 7) return false; }
        }
      }
    }
    return true;
  });
}

// ─── Constraints ───────────────────────────────────────────────────────────────

function createConstraints() {
  return {
    exactPosition:        new Map(),
    exactNumberAtPosition: new Map(),
    minPosition:          new Map(),
    maxPosition:          new Map(),
  };
}

function getMin(c, n) { return c.minPosition.get(n) ?? 1; }
function getMax(c, n) { return c.maxPosition.get(n) ?? 90; }

function canSetExact(c, n, pos) {
  const exact = c.exactPosition.get(n);
  if (Number.isInteger(exact) && exact !== pos) return false;
  const numAtPos = c.exactNumberAtPosition.get(pos);
  if (Number.isInteger(numAtPos) && numAtPos !== n) return false;
  return getMin(c, n) <= pos && pos <= getMax(c, n);
}

function setExact(c, n, pos) {
  if (!canSetExact(c, n, pos)) return false;
  c.exactPosition.set(n, pos);
  c.exactNumberAtPosition.set(pos, n);
  c.minPosition.set(n, pos);
  c.maxPosition.set(n, pos);
  return true;
}

function setMin(c, n, pos) {
  const exact = c.exactPosition.get(n);
  if (Number.isInteger(exact) && exact < pos) return false;
  if (pos > getMax(c, n)) return false;
  c.minPosition.set(n, Math.max(getMin(c, n), pos));
  return true;
}

function setMax(c, n, pos) {
  const exact = c.exactPosition.get(n);
  if (Number.isInteger(exact) && exact > pos) return false;
  if (pos < getMin(c, n)) return false;
  c.maxPosition.set(n, Math.min(getMax(c, n), pos));
  return true;
}

function isGuaranteedAfter(c, n, threshold) {
  const exact = c.exactPosition.get(n);
  if (Number.isInteger(exact)) return exact > threshold;
  return getMin(c, n) > threshold;
}

function canForceAfter(c, n, threshold) {
  const exact = c.exactPosition.get(n);
  if (Number.isInteger(exact)) return exact > threshold;
  return getMax(c, n) > threshold;
}

function chooseQuotaBlockers(groups, threshold, quotaForGroup, constraints) {
  const quotas  = groups.map(g => Math.max(0, quotaForGroup(g)));
  const needs   = groups.map((g, i) => {
    const alreadyAfter = g.filter(n => isGuaranteedAfter(constraints, n, threshold)).length;
    return Math.max(0, quotas[i] - alreadyAfter);
  });
  const numberToGroups = Array.from({ length: 91 }, () => []);
  for (let i = 0; i < groups.length; i++) {
    for (const n of groups[i]) {
      if (n >= 1 && n <= 90) numberToGroups[n].push(i);
    }
  }
  while (needs.some(need => need > 0)) {
    let best = null, bestCover = [];
    for (let n = 1; n <= 90; n++) {
      if (isGuaranteedAfter(constraints, n, threshold)) continue;
      if (!canForceAfter(constraints, n, threshold)) continue;
      const cover = numberToGroups[n].filter(i => needs[i] > 0);
      if (!cover.length) continue;
      const score = cover.length * 100 + randomInt(30) + (getMin(constraints, n) > threshold ? 15 : 0);
      if (!best || score > best.score) { best = { number: n, score }; bestCover = cover; }
    }
    if (!best) return false;
    if (!setMin(constraints, best.number, threshold + 1)) return false;
    bestCover.forEach(i => { needs[i] -= 1; });
  }
  return true;
}

function pickFinisher(numbers, call, constraints) {
  const options = shuffle(numbers).filter(n => canSetExact(constraints, n, call));
  return options.length ? options[0] : null;
}

function constrainStandardTarget(spec, constraints) {
  const nums = categoryNumbers(spec.ticket, spec.key);
  if (!nums.length) return false;
  const finisher = pickFinisher(nums, spec.call, constraints);
  if (!finisher || !setExact(constraints, finisher, spec.call)) return false;
  for (const n of nums) {
    if (n === finisher) continue;
    if (!setMax(constraints, n, spec.call - 1)) return false;
  }
  return true;
}

function constrainMultiStandardTarget(spec, constraints) {
  const specTickets = spec.tickets?.length > 0 ? spec.tickets : [spec.ticket];
  const numSets = specTickets.map(t => categoryNumbers(t, spec.key));
  const allNums = [...new Set(numSets.flat())];
  if (!allNums.length) return false;
  const intersection = numSets[0].filter(n => numSets.every(s => s.includes(n)));
  if (!intersection.length) return false;
  const finisher = pickFinisher(intersection, spec.call, constraints);
  if (!finisher || !setExact(constraints, finisher, spec.call)) return false;
  for (const n of allNums) {
    if (n === finisher) continue;
    if (!setMax(constraints, n, spec.call - 1)) return false;
  }
  return true;
}

function constrainQuick7SingleTarget(ticket, spec, constraints) {
  const nums = ticketNumbers(ticket);
  if (nums.length < 7) return false;
  const exactAtCall = nums.find(n => constraints.exactPosition.get(n) === spec.call);
  const finisher = exactAtCall || pickFinisher(nums, spec.call, constraints);
  if (!finisher || !setExact(constraints, finisher, spec.call)) return false;
  const earlyBefore = new Set(nums.filter(n => {
    const exact = constraints.exactPosition.get(n);
    if (Number.isInteger(exact) && exact < spec.call) return true;
    return getMax(constraints, n) < spec.call;
  }));
  if (earlyBefore.size > 6) return false;
  const needBefore = 6 - earlyBefore.size;
  const beforeOptions = shuffle(nums)
    .filter(n => n !== finisher && !earlyBefore.has(n))
    .filter(n => setMax({ ...constraints, maxPosition: new Map(constraints.maxPosition) }, n, spec.call - 1));
  if (beforeOptions.length < needBefore) return false;
  const selectedBefore = new Set(beforeOptions.slice(0, needBefore));
  for (const n of selectedBefore) {
    if (!setMax(constraints, n, spec.call - 1)) return false;
  }
  for (const n of nums) {
    if (n === finisher || earlyBefore.has(n) || selectedBefore.has(n)) continue;
    if (!setMin(constraints, n, spec.call + 1)) return false;
  }
  return true;
}

function constrainQuick7MultiTarget(spec, constraints) {
  const specTickets = spec.tickets?.length > 0 ? spec.tickets : [spec.ticket];
  const allNumSets = specTickets.map(t => ticketNumbers(t));
  if (allNumSets.some(s => s.length < 7)) return false;
  const intersection = allNumSets[0].filter(n => allNumSets.every(s => s.includes(n)));
  if (!intersection.length) return false;
  const finisher = pickFinisher(shuffle(intersection), spec.call, constraints);
  if (!finisher || !setExact(constraints, finisher, spec.call)) return false;
  for (const ticket of specTickets) {
    const nums = ticketNumbers(ticket);
    const earlyBefore = new Set(nums.filter(n => {
      if (n === finisher) return false;
      const exact = constraints.exactPosition.get(n);
      if (Number.isInteger(exact) && exact < spec.call) return true;
      return getMax(constraints, n) < spec.call;
    }));
    if (earlyBefore.size > 6) return false;
    const needBefore = 6 - earlyBefore.size;
    const beforeOptions = shuffle(nums)
      .filter(n => n !== finisher && !earlyBefore.has(n))
      .filter(n => setMax({ ...constraints, maxPosition: new Map(constraints.maxPosition) }, n, spec.call - 1));
    if (beforeOptions.length < needBefore) return false;
    const selectedBefore = new Set(beforeOptions.slice(0, needBefore));
    for (const n of selectedBefore) {
      if (!setMax(constraints, n, spec.call - 1)) return false;
    }
    for (const n of nums) {
      if (n === finisher || earlyBefore.has(n) || selectedBefore.has(n)) continue;
      if (!setMin(constraints, n, spec.call + 1)) return false;
    }
  }
  return true;
}

function constrainQuick7Target(spec, constraints) {
  if (spec.tickets?.length > 1) return constrainQuick7MultiTarget(spec, constraints);
  return constrainQuick7SingleTarget(spec.ticket, spec, constraints);
}

function cloneConstraints(c) {
  return {
    exactPosition:        new Map(c.exactPosition),
    exactNumberAtPosition: new Map(c.exactNumberAtPosition),
    minPosition:          new Map(c.minPosition),
    maxPosition:          new Map(c.maxPosition),
  };
}

function addTargetConstraints(activeSpecs, constraints) {
  const ordered = [...activeSpecs].sort(
    (a, b) => a.call - b.call || RULE_ORDER.indexOf(a.key) - RULE_ORDER.indexOf(b.key)
  );
  for (const spec of ordered) {
    let ok;
    if (spec.type === "quick7")          ok = constrainQuick7Target(spec, constraints);
    else if (spec.tickets?.length > 1)   ok = constrainMultiStandardTarget(spec, constraints);
    else                                  ok = constrainStandardTarget(spec, constraints);
    if (!ok) return false;
  }
  return true;
}

function addRegularBlockers(tickets, activeSpecs, constraints) {
  const specs = activeSpecs
    .filter(s => s.type !== "fullRank")
    .sort((a, b) => b.call - a.call);

  for (const spec of specs) {
    const targetSet  = new Set(spec.targets || [spec.target]);
    const nonTargets = tickets.filter(t => !targetSet.has(ticketLabel(t)));
    if (spec.type === "quick7") {
      const groups = nonTargets.map(t => ticketNumbers(t));
      if (!chooseQuotaBlockers(groups, spec.call, g => Math.max(0, g.length - 6), constraints)) return false;
    } else {
      const groups = nonTargets.map(t => categoryNumbers(t, spec.key));
      if (!chooseQuotaBlockers(groups, spec.call, () => 1, constraints)) return false;
    }
  }
  return true;
}

function addFullHouseBlockers(tickets, activeSpecs, constraints) {
  const fullSpecs = activeSpecs
    .filter(s => s.type === "fullRank")
    .sort((a, b) => b.rank - a.rank);

  for (const spec of fullSpecs) {
    const earlierTargets = activeSpecs
      .filter(c => c.type === "fullRank" && c.rank < spec.rank)
      .flatMap(c => c.targets || [c.target]);
    const protectedTargets = new Set([...earlierTargets, ...(spec.targets || [spec.target])]);
    const groups = tickets.filter(t => !protectedTargets.has(ticketLabel(t))).map(ticketNumbers);
    if (!chooseQuotaBlockers(groups, spec.call, () => 1, constraints)) return false;
  }
  return true;
}

function buildInitialSequence(tickets, activeSpecs) {
  const constraints = createConstraints();
  if (!addTargetConstraints(activeSpecs, constraints))  return null;
  if (!addFullHouseBlockers(tickets, activeSpecs, constraints)) return null;
  if (!addRegularBlockers(tickets, activeSpecs, constraints))   return null;

  const sequence = Array(91).fill(null);
  const assigned = new Set();

  for (const [n, pos] of constraints.exactPosition.entries()) {
    if (sequence[pos] && sequence[pos] !== n) return null;
    sequence[pos] = n;
    assigned.add(n);
  }

  for (let pos = 1; pos <= 90; pos++) {
    if (sequence[pos]) continue;
    const candidates = [];
    for (let n = 1; n <= 90; n++) {
      if (assigned.has(n)) continue;
      const mn = getMin(constraints, n);
      const mx = getMax(constraints, n);
      if (mn <= pos && pos <= mx) candidates.push({ number: n, min: mn, max: mx });
    }
    if (!candidates.length) return null;
    candidates.sort((a, b) => a.max - b.max || b.min - a.min);
    const urgentLimit = candidates[0].max + 3;
    const pool = candidates.filter(c => c.max <= urgentLimit).slice(0, 14);
    const chosen = pick(pool);
    sequence[pos] = chosen.number;
    assigned.add(chosen.number);
  }

  const output = sequence.slice(1);
  return new Set(output).size === 90 ? output : null;
}

// ─── Contradiction check ───────────────────────────────────────────────────────

function checkContradictions(activeSpecs) {
  const byKey = Object.fromEntries(activeSpecs.map(s => [s.key, s]));
  const lineKeys = ["top", "middle", "bottom", "corners", "quick7"];
  const fullKeys = ["full", "secondFull"];

  for (const lk of lineKeys) {
    const lSpec = byKey[lk];
    if (!lSpec) continue;
    for (const fk of fullKeys) {
      const fSpec = byKey[fk];
      if (!fSpec) continue;
      if (lSpec.call > fSpec.call)
        return `${lSpec.label} target call (${lSpec.call}) is after ${fSpec.label} call (${fSpec.call}). Adjust calls.`;
    }
  }
  if (byKey.full && byKey.secondFull && byKey.full.call >= byKey.secondFull.call)
    return "Full House call must be before Second Full House call.";

  for (const spec of activeSpecs) {
    if ((spec.key === "full" || spec.key === "secondFull") && spec.call < 74)
      return `${spec.label} call must be 74 or later.`;
    if (["top", "middle", "bottom"].includes(spec.key) && spec.call < 5)
      return `${spec.label} call must be 5 or later.`;
    if (spec.key === "corners" && spec.call < 4)
      return "Corners call must be 4 or later.";
    if (spec.key === "quick7" && spec.call < 7)
      return "Quick 7 call must be 7 or later.";
  }
  return null;
}

// ─── Optimisation ─────────────────────────────────────────────────────────────

function desiredCallsFor(count, finishCall) {
  if (count <= 0) return [];
  const start = count <= 7
    ? Math.max(4,  finishCall - 28)
    : Math.max(8,  finishCall - 68);
  const calls = [];
  for (let i = 0; i < count; i++)
    calls.push(Math.round(start + ((finishCall - start) * i) / Math.max(1, count - 1)));
  calls[count - 1] = finishCall;
  return calls;
}

function naturalnessScore(sequence, activeSpecs) {
  const pos = positionMap(sequence);
  let score = 0;
  for (const spec of activeSpecs) {
    let actual = categoryNumbers(spec.ticket, spec.key)
      .map(n => pos.get(n))
      .filter(p => p != null)
      .sort((a, b) => a - b);
    if (spec.type === "quick7") actual = actual.slice(0, 7);
    const desired = desiredCallsFor(actual.length, spec.call);
    for (let i = 0; i < actual.length; i++) score += Math.abs(actual[i] - desired[i]) * 3;
    score += Math.abs(Math.max(...actual) - spec.call) * 12;
    score += actual.filter(c => c <= 8).length * 12;
  }
  return score;
}

async function optimizeSequence(tickets, sequence, activeSpecs, steps) {
  const cache = createTicketNumbersCache(tickets);
  let best = [...sequence];
  let bestScore = naturalnessScore(best, activeSpecs);
  for (let step = 0; step < steps; step++) {
    if (step > 0 && step % 2000 === 0) await yieldControl();
    const candidate = [...best];
    const li = randomInt(90);
    const ri = randomInt(90);
    if (li === ri) continue;
    [candidate[li], candidate[ri]] = [candidate[ri], candidate[li]];
    if (!isVerified(tickets, candidate, activeSpecs, cache)) continue;
    const score = naturalnessScore(candidate, activeSpecs);
    if (score < bestScore) { best = candidate; bestScore = score; }
  }
  return best;
}

// ─── Report ────────────────────────────────────────────────────────────────────

function describeResult(tickets, sequence, spec) {
  const pos = positionMap(sequence);
  const nums = categoryNumbers(spec.ticket, spec.key);
  const numberCalls = nums.map(n => ({ number: n, call: pos.get(n) })).sort((a, b) => a.call - b.call);
  const completion  = getRuleCompletion(sequence, spec.ticket, spec.key);
  return {
    label: spec.label, ticket: ticketLabel(spec.ticket), name: ticketName(spec.ticket),
    completeAtCall: completion?.completeAtCall, completeNumber: completion?.completeNumber,
    numbers: spec.type === "quick7" ? numberCalls.slice(0, 7).map(e => e.number) : nums,
    numberCalls,
    firstWinners: getRuleWinners(tickets, sequence, spec),
  };
}

function buildReport(tickets, sequence, activeSpecs) {
  const targets = {};
  for (const spec of activeSpecs) targets[REPORT_KEYS[spec.key]] = describeResult(tickets, sequence, spec);
  return {
    targets,
    activeRules: activeSpecs.map(s => ({
      key: s.key, reportKey: REPORT_KEYS[s.key], label: s.label,
      target: s.target, call: s.call,
    })),
    top10FullHouse: getRanks(tickets, sequence, "full").slice(0, 10),
    sequence,
  };
}

// ─── Unintended winners ────────────────────────────────────────────────────────

function buildUnintendedWinners(tickets, sequence, activeSpecs) {
  const unintended = {};
  for (const spec of activeSpecs) {
    const callNum    = spec.call;
    const calledSet  = new Set(sequence.slice(0, callNum));
    const pos        = positionMap(sequence);
    const targetSet  = new Set(spec.targets || [spec.target]);
    const winners    = [];

    for (const ticket of tickets) {
      const lbl = ticketLabel(ticket);
      if (targetSet.has(lbl)) continue;
      let wins = false;

      if (spec.type === "quick7") {
        const nums = ticketNumbers(ticket);
        const hits = nums
          .filter(n => calledSet.has(n))
          .map(n => pos.get(n))
          .sort((a, b) => a - b);
        wins = hits.length >= 7 && hits[6] <= callNum;
      } else if (spec.type === "fullRank") {
        const nums = ticketNumbers(ticket);
        if (nums.every(n => calledSet.has(n))) {
          const completion = getCompletionFromNumbers(sequence, nums);
          wins = completion?.completeAtCall === callNum;
        }
      } else {
        const catNums = categoryNumbers(ticket, spec.key);
        if (catNums.every(n => calledSet.has(n))) {
          const completion = getCompletionFromNumbers(sequence, catNums);
          wins = completion?.completeAtCall === callNum;
        }
      }
      if (wins) winners.push(lbl);
    }
    const ruleId = KEY_TO_RULE_ID[spec.key];
    if (ruleId) unintended[ruleId] = winners;
  }
  return unintended;
}

// ─── Async yield ───────────────────────────────────────────────────────────────

function yieldControl() {
  return new Promise(resolve => setTimeout(resolve, 0));
}

// ─── Input parsing ─────────────────────────────────────────────────────────────

function normalizeTicketLabel(value) {
  const number = Number(String(value || "").replace(/\D/g, ""));
  if (!Number.isInteger(number) || number <= 0) throw new Error(`Invalid ticket label: ${value}`);
  return `T${number}`;
}

function normalizeCall(value, fallback) {
  const number = Number(value ?? fallback);
  if (!Number.isInteger(number) || number < 1 || number > 90)
    throw new Error(`Call must be 1–90, got: ${value}`);
  return number;
}

function getActiveSpecs(options, byLabel) {
  const activeSpecs = [];
  for (const key of RULE_ORDER) {
    const rule = RULES[key];
    const targetValue = options.targets?.[key] ?? "";
    let rawValues = Array.isArray(targetValue)
      ? targetValue
      : typeof targetValue === "string"
        ? targetValue.split(",").map(s => s.trim()).filter(Boolean)
        : [];
    const targetLabels = rawValues
      .map(v => { try { return normalizeTicketLabel(v); } catch { return ""; } })
      .filter(Boolean);
    if (!targetLabels.length) continue;
    for (const lbl of targetLabels) {
      if (!byLabel.has(lbl)) throw new Error(`Ticket ${lbl} was not found in the tickets list.`);
    }
    const callValue = options.calls?.[key] ?? rule.defaultCall;
    activeSpecs.push({
      key, ...rule,
      target:  targetLabels[0],
      targets: targetLabels,
      ticket:  byLabel.get(targetLabels[0]),
      tickets: targetLabels.map(lbl => byLabel.get(lbl)),
      call: normalizeCall(callValue, rule.defaultCall),
    });
  }
  return activeSpecs;
}

function validateActiveSpecs(activeSpecs) {
  const byKey = new Map(activeSpecs.map(s => [s.key, s]));
  if (byKey.has("secondFull") && !byKey.has("full"))
    throw new Error("Configure Full House before using Second Full House.");
  const fullStages = [...byKey.values()]
    .filter(s => s.type === "fullRank")
    .sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < fullStages.length; i++) {
    if (fullStages[i].call <= fullStages[i - 1].call)
      throw new Error("Full House calls must increase in order.");
  }
}

// ─── Main generation ───────────────────────────────────────────────────────────

async function generateSequence(options) {
  const tickets = options.tickets || [];
  if (!Array.isArray(tickets) || !tickets.length) throw new Error("No tickets provided.");

  const byLabel = new Map(tickets.map(t => [ticketLabel(t), t]));
  const activeSpecs = getActiveSpecs(options, byLabel);
  if (!activeSpecs.length) throw new Error("Choose at least one target winner.");

  validateActiveSpecs(activeSpecs);

  // Pre-validate multi-target intersections
  for (const spec of activeSpecs) {
    if (spec.tickets?.length > 1) {
      const numSets = spec.tickets.map(t => categoryNumbers(t, spec.key));
      const intersection = numSets[0].filter(n => numSets.every(s => s.includes(n)));
      if (!intersection.length)
        throw new Error(`Selected tickets for ${spec.label} share no numbers and cannot win together.`);
    }
  }

  const cache        = createTicketNumbersCache(tickets);
  const nonFullSpecs = activeSpecs.filter(s => s.type !== "fullRank");
  const fullSpecs    = activeSpecs.filter(s => s.type === "fullRank").sort((a, b) => a.rank - b.rank);

  const MAX_RETRIES       = 80;
  const SUB_ATTEMPTS_FIRST = 8000;
  const SUB_ATTEMPTS_REST  = 4000;

  let sequence     = null;
  let successSpecs = null;

  for (let retry = 0; retry < MAX_RETRIES; retry++) {
    if (retry % 5 === 0) await yieldControl();

    // Assign call numbers for this retry
    let currentCall;
    if      (retry < 20) currentCall = 25 + Math.floor(retry / 4) * 2 + randomInt(3);
    else if (retry < 50) currentCall = 22 + randomInt(20);
    else                 currentCall = 30 + randomInt(30);

    const shuffledNonFull = shuffle(nonFullSpecs);
    for (const spec of shuffledNonFull) {
      spec.call = currentCall;
      currentCall += 5 + randomInt(8);
    }

    let prevFullCall = Math.max(73, currentCall + 1);
    for (const spec of fullSpecs) {
      spec.call = prevFullCall + 1;
      prevFullCall = spec.call + 4 + randomInt(5);
    }

    try { validateActiveSpecs(activeSpecs); } catch { continue; }

    const contradiction = checkContradictions(activeSpecs);
    if (contradiction) continue;

    const subAttempts = retry === 0 ? SUB_ATTEMPTS_FIRST : SUB_ATTEMPTS_REST;
    let candidate = null;

    for (let attempt = 0; attempt < subAttempts; attempt++) {
      if (attempt > 0 && attempt % 1000 === 0) {
        self.postMessage({ type: "progress", retry, attempt, total: MAX_RETRIES * subAttempts });
        await yieldControl();
      }
      candidate = buildInitialSequence(tickets, activeSpecs);
      if (candidate && isVerified(tickets, candidate, activeSpecs, cache)) break;
      candidate = null;
    }

    if (candidate) {
      sequence     = candidate;
      successSpecs = JSON.parse(JSON.stringify(activeSpecs));
      break;
    }
  }

  if (!sequence) {
    const contradiction = checkContradictions(activeSpecs);
    if (contradiction) throw new Error(`Could not generate: ${contradiction}`);
    throw new Error(
      "Could not generate a matching sequence. Try selecting different tickets or adjusting the game rules."
    );
  }

  // Restore the calls from the successful attempt
  for (const spec of activeSpecs) {
    const match = successSpecs.find(s => s.key === spec.key && s.target === spec.target);
    if (match) spec.call = match.call;
  }

  // Optimise spacing
  self.postMessage({ type: "progress", retry: MAX_RETRIES, attempt: 0, total: MAX_RETRIES, phase: "optimizing" });
  sequence = await optimizeSequence(tickets, sequence, activeSpecs, 30000);

  const report             = buildReport(tickets, sequence, activeSpecs);
  const unintendedWinners  = buildUnintendedWinners(tickets, sequence, activeSpecs);
  report.unintendedWinners = unintendedWinners;

  // Build generatedCalls map (rule-id → call number)
  const generatedCalls = {};
  for (const spec of activeSpecs) {
    const ruleId = KEY_TO_RULE_ID[spec.key];
    if (ruleId) generatedCalls[ruleId] = spec.call;
  }

  return { report, generatedCalls, unintendedWinners };
}

// ─── Worker entry point ────────────────────────────────────────────────────────

self.addEventListener("message", async event => {
  const { tickets, targets, calls, id } = event.data || {};
  try {
    const result = await generateSequence({ tickets, targets, calls });
    self.postMessage({ type: "result", ok: true, id, ...result });
  } catch (error) {
    self.postMessage({ type: "result", ok: false, id, error: error.message || "Generation failed." });
  }
});
