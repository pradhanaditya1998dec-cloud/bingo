"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { saveRiggedWinners } from "../lib/gameStore";
import { WIN_LABELS, getSharedNumbers, reconstructGrid } from "../lib/tambola";

// ─── Key mapping between our Firestore schema and the worker's internal keys ──

const OUR_KEY_TO_WORKER_KEY = {
  quickSeven:     "quick7",
  topLine:        "top",
  middleLine:     "middle",
  lastLine:       "bottom",
  corners:        "corners",
  fullHouse:      "full",
  secondFullHouse:"secondFull",
};

// generatedCalls / unintendedWinners from the worker use rule-id strings
const WORKER_RULE_ID_TO_OUR_KEY = {
  "quick-7":        "quickSeven",
  "top-line":       "topLine",
  "middle-line":    "middleLine",
  "bottom-line":    "lastLine",
  "corners":        "corners",
  "full-house":     "fullHouse",
  "second-full-house": "secondFullHouse",
};

/** Convert our flat ticket (numbers[27]) to the 3×9 cells format the worker expects. */
function toWorkerTickets(ticketsMap) {
  return Object.values(ticketsMap)
    .filter(t => t.status === "booked")
    .map(t => ({
      id: t.id,
      cells: [
        (t.numbers || []).slice(0,  9),
        (t.numbers || []).slice(9,  18),
        (t.numbers || []).slice(18, 27),
      ],
      booking: { name: t.userName || "Available" },
    }));
}

// ─── MultiSelectDropdown ──────────────────────────────────────────────────────

function MultiSelectDropdown({ options, selected = [], onChange, placeholder = "Select tickets...", footer, disabled = false }) {
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const displayLabel = useMemo(() => {
    if (selected.length === 0) return placeholder;
    return selected.map(id => {
      const opt = options.find(o => o.id === id);
      return opt ? `${id} (${opt.userName})` : id;
    }).join(", ");
  }, [selected, options, placeholder]);

  return (
    <div className="multiselect-container" ref={dropdownRef}>
      <div
        className={`multiselect-header ${open ? "open" : ""}`}
        onClick={() => { if (!disabled) setOpen(!open); }}
        style={{ opacity: disabled ? 0.65 : 1, cursor: disabled ? "not-allowed" : "pointer" }}
      >
        <span className="multiselect-text">{displayLabel}</span>
        <span className="multiselect-arrow">{open ? "▲" : "▼"}</span>
      </div>

      {open && (
        <div className="multiselect-popover">
          {options.map(opt => {
            const isChecked = selected.includes(opt.id);
            return (
              <label key={opt.id} className="multiselect-item">
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => {
                    const next = isChecked
                      ? selected.filter(id => id !== opt.id)
                      : [...selected, opt.id];
                    onChange(next);
                  }}
                  className="multiselect-checkbox"
                />
                <span className="multiselect-item-label">{opt.id} ({opt.userName})</span>
              </label>
            );
          })}
          {options.length === 0 && (
            <div className="multiselect-empty">No tickets booked yet</div>
          )}
          {footer && footer}
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function RiggingTab({ gameId, game, tickets = {}, bookedTickets = [], gameStatus, onSuccess }) {
  const [riggedWinners,    setRiggedWinners]    = useState({});
  const [riggingLoading,   setRiggingLoading]   = useState(false);
  const [progressMsg,      setProgressMsg]      = useState("");
  const [previewSeq,       setPreviewSeq]       = useState(null);
  const [previewWins,      setPreviewWins]      = useState(null);
  const [generatedCalls,   setGeneratedCalls]   = useState({});   // ourKey → call number
  const [unintendedWinners,setUnintendedWinners]= useState({});   // ourKey → [ticketLabel,...]

  const workerRef = useRef(null);

  // Terminate worker on unmount
  useEffect(() => {
    return () => {
      if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }
    };
  }, []);

  // Initialise riggedWinners from game document
  useEffect(() => {
    if (game?.riggedWinners) {
      const normalized = {};
      const keyMap = {
        quick7: "quickSeven", "quick-7": "quickSeven",
        top: "topLine", "top-line": "topLine",
        middle: "middleLine", "middle-line": "middleLine",
        bottom: "lastLine", "bottom-line": "lastLine",
        full: "fullHouse", "full-house": "fullHouse",
        secondFull: "secondFullHouse", "second-full-house": "secondFullHouse",
      };

      Object.entries(game.riggedWinners).forEach(([k, v]) => {
        const stdKey = keyMap[k] || k;
        const arr = Array.isArray(v) ? v : [v].filter(Boolean);
        const unique = Array.from(new Set(arr));
        if (unique.length > 0) {
          normalized[stdKey] = Array.from(new Set([...(normalized[stdKey] || []), ...unique]));
        }
      });
      setRiggedWinners(normalized);
    }
  }, [game]);

  // List of win rules configured for this game
  const activeRulesList = useMemo(() => {
    if (!game?.rules) return [];
    const list = [];
    const order = ["quickSeven", "corners", "topLine", "middleLine", "lastLine", "fullHouse", "secondFullHouse"];
    order.forEach(k => {
      if (k === "fullHouse" || game.rules[k]) {
        list.push({ key: k, label: WIN_LABELS[k] || k });
      }
    });
    return list;
  }, [game]);

  const hasChanges = useMemo(() => {
    const keys = ["quickSeven", "corners", "topLine", "middleLine", "lastLine", "fullHouse", "secondFullHouse"];
    return keys.some(k => {
      const stateVal = riggedWinners[k] || [];
      const dbVal = game?.riggedWinners?.[k]
        ? (Array.isArray(game.riggedWinners[k]) ? game.riggedWinners[k] : [game.riggedWinners[k]])
        : [];
      if (stateVal.length !== dbVal.length) return true;
      const s1 = [...stateVal].sort();
      const s2 = [...dbVal].sort();
      return !s1.every((val, i) => val === s2[i]);
    });
  }, [game, riggedWinners]);

  // ── Simulate wins from a sequence ──────────────────────────────────────────
  function getSequenceWins(ticketsMap, riggedWinnersMap, seq) {
    const wins = [];
    const called = new Set();

    // Standardise keys and deduplicate ticket IDs
    const cleanMap = {};
    const keyMap = {
      quick7: "quickSeven", "quick-7": "quickSeven",
      top: "topLine", "top-line": "topLine",
      middle: "middleLine", "middle-line": "middleLine",
      bottom: "lastLine", "bottom-line": "lastLine",
      full: "fullHouse", "full-house": "fullHouse",
      secondFull: "secondFullHouse", "second-full-house": "secondFullHouse",
    };

    Object.entries(riggedWinnersMap).forEach(([k, v]) => {
      const stdKey = keyMap[k] || k;
      const arr = Array.isArray(v) ? v : [v].filter(Boolean);
      if (arr.length > 0) {
        cleanMap[stdKey] = Array.from(new Set([...(cleanMap[stdKey] || []), ...arr]));
      }
    });

    const satisfiedRiggedWinners = {};
    Object.keys(cleanMap).forEach(winType => {
      satisfiedRiggedWinners[winType] = new Set();
    });
    const firstFullHouseWinnerIds = new Set();

    function getRequiredNumbers(ticket, winType) {
      const rows = reconstructGrid(ticket.numbers);
      if (winType === "topLine")        return rows[0].filter(n => n > 0);
      if (winType === "middleLine")     return rows[1].filter(n => n > 0);
      if (winType === "lastLine")       return rows[2].filter(n => n > 0);
      if (winType === "corners") {
        const r0 = rows[0].filter(n => n > 0);
        const r2 = rows[2].filter(n => n > 0);
        const corners = [];
        if (r0.length) corners.push(r0[0], r0[r0.length - 1]);
        if (r2.length) corners.push(r2[0], r2[r2.length - 1]);
        return corners;
      }
      if (winType === "fullHouse" || winType === "secondFullHouse")
        return rows.flat().filter(n => n > 0);
      return [];
    }

    function checkWin(ticket, winType) {
      if (!ticket || !ticket.numbers) return false;
      if (winType === "quickSeven") {
        return ticket.numbers.filter(n => n > 0 && called.has(n)).length >= 7;
      }
      const req = getRequiredNumbers(ticket, winType);
      if (req.length === 0) return false;
      if (winType === "secondFullHouse") {
        return req.every(n => called.has(n)) && !firstFullHouseWinnerIds.has(ticket.id);
      }
      return req.every(n => called.has(n));
    }

    for (let i = 0; i < seq.length; i++) {
      const num = seq[i];
      called.add(num);

      Object.entries(cleanMap).forEach(([winType, ticketIds]) => {
        if (!ticketIds || ticketIds.length === 0) return;

        const roundRiggedWinners = ticketIds.filter(id => {
          if (satisfiedRiggedWinners[winType].has(id)) return false;
          const ticket = ticketsMap[id];
          return checkWin(ticket, winType);
        });

        if (roundRiggedWinners.length > 0) {
          roundRiggedWinners.forEach(id => satisfiedRiggedWinners[winType].add(id));

          const coWinners = [];
          Object.values(ticketsMap).forEach(t => {
            if (t.status !== "booked") return;
            if (ticketIds.includes(t.id)) return;
            if (checkWin(t, winType)) {
              coWinners.push({ id: t.id, userName: t.userName });
            }
          });

          if (winType === "fullHouse") {
            roundRiggedWinners.forEach(id => firstFullHouseWinnerIds.add(id));
            coWinners.forEach(cw => firstFullHouseWinnerIds.add(cw.id));
          }

          wins.push({
            winType,
            label:         WIN_LABELS[winType] || winType,
            drawNumber:    i + 1,
            winningNumber: num,
            ticketIds:     roundRiggedWinners,
            coWinners,
          });
        }
      });
    }
    return wins;
  }

  // ── Saved wins (shown when a sequence is already in the DB) ────────────────
  const savedWins = useMemo(() => {
    if (!game?.riggedSequence || !game?.riggedWinners) return null;
    const normalized = {};
    Object.entries(game.riggedWinners).forEach(([k, v]) => {
      normalized[k] = Array.isArray(v) ? v : [v].filter(Boolean);
    });
    return getSequenceWins(tickets, normalized, game.riggedSequence);
  }, [game, tickets]);

  // ── Generate via Web Worker ─────────────────────────────────────────────────
  function handleGeneratePreview() {
    // Kill any in-flight worker
    if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }

    setRiggingLoading(true);
    setProgressMsg("Initialising…");
    setPreviewSeq(null);
    setPreviewWins(null);
    setGeneratedCalls({});
    setUnintendedWinners({});

    const workerTickets = toWorkerTickets(tickets);

    // Map our keys to the worker's internal keys
    const targets = {};
    Object.entries(riggedWinners).forEach(([ourKey, ticketIds]) => {
      if (!Array.isArray(ticketIds) || ticketIds.length === 0) return;
      const workerKey = OUR_KEY_TO_WORKER_KEY[ourKey];
      if (workerKey) targets[workerKey] = ticketIds;
    });

    let worker;
    try {
      worker = new Worker("/sequence-worker.js");
    } catch (e) {
      setRiggingLoading(false);
      setProgressMsg("");
      alert("Web Worker not supported in this environment. Please use a modern browser.");
      return;
    }
    workerRef.current = worker;

    worker.onmessage = evt => {
      const msg = evt.data || {};

      if (msg.type === "progress") {
        if (msg.phase === "optimizing") {
          setProgressMsg("Optimising sequence spacing…");
        } else {
          const pct = msg.total > 0 ? Math.min(99, Math.round((msg.attempt / msg.total) * 100)) : 0;
          setProgressMsg(`Generating… ${pct}%`);
        }
        return;
      }

      if (msg.type === "result") {
        worker.terminate();
        workerRef.current = null;
        setRiggingLoading(false);
        setProgressMsg("");

        if (!msg.ok) {
          alert("Could not generate sequence:\n" + (msg.error || "Unknown error"));
          return;
        }

        const seq = msg.report?.sequence;
        if (!seq || seq.length !== 90) { alert("Invalid sequence returned."); return; }

        // Map generatedCalls (rule-id → call) back to our keys
        const ourCalls = {};
        Object.entries(msg.generatedCalls || {}).forEach(([ruleId, call]) => {
          const ourKey = WORKER_RULE_ID_TO_OUR_KEY[ruleId];
          if (ourKey) ourCalls[ourKey] = call;
        });

        // Map unintendedWinners (rule-id → ticketLabel[]) back to our keys
        const ourUnintended = {};
        Object.entries(msg.unintendedWinners || {}).forEach(([ruleId, labels]) => {
          const ourKey = WORKER_RULE_ID_TO_OUR_KEY[ruleId];
          if (ourKey && labels.length > 0) ourUnintended[ourKey] = labels;
        });

        setGeneratedCalls(ourCalls);
        setUnintendedWinners(ourUnintended);

        const wins = getSequenceWins(tickets, riggedWinners, seq);
        setPreviewSeq(seq);
        setPreviewWins(wins);
      }
    };

    worker.onerror = err => {
      if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }
      setRiggingLoading(false);
      setProgressMsg("");
      alert("Worker error: " + (err.message || "Unknown error"));
    };

    worker.postMessage({ tickets: workerTickets, targets, calls: {} });
  }

  function handleCancelGeneration() {
    if (workerRef.current) { workerRef.current.terminate(); workerRef.current = null; }
    setRiggingLoading(false);
    setProgressMsg("");
  }

  async function handleSavePreview() {
    if (!previewSeq) return;
    setRiggingLoading(true);
    try {
      await saveRiggedWinners(gameId, riggedWinners, previewSeq);
      onSuccess?.("🔮 Predetermined winners sequence applied and saved successfully!");
      setPreviewSeq(null);
      setPreviewWins(null);
      setGeneratedCalls({});
      setUnintendedWinners({});
    } catch (e) {
      alert("Failed to apply draw sequence: " + e.message);
    } finally {
      setRiggingLoading(false);
    }
  }

  async function handleClearRigging() {
    if (!window.confirm("Are you sure you want to clear the rigged sequence? The game will revert to a completely random draw.")) return;
    setRiggingLoading(true);
    try {
      await saveRiggedWinners(gameId, {}, null);
      setPreviewSeq(null);
      setPreviewWins(null);
      setGeneratedCalls({});
      setUnintendedWinners({});
      onSuccess?.("🔮 Sequence rigging cleared! The game is now set to normal random draw.");
    } catch (e) {
      alert("Failed to clear rigging: " + e.message);
    } finally {
      setRiggingLoading(false);
    }
  }

  const isSavedMode  = !previewSeq && !!game?.riggedSequence && !!game?.riggedWinners;
  const displaySeq   = previewSeq || game?.riggedSequence || null;
  const displayWins  = previewSeq ? previewWins : savedWins;

  // Check for any unintended winners across all categories
  const hasUnintended = Object.values(unintendedWinners).some(arr => arr.length > 0);

  if (!gameId) return <div className="sp-loading">No active game selected. Create or select a game first!</div>;

  return (
    <div className="sp-section">
      <div className="sp-section-header">
        <h3 className="sp-section-title">🔮 Predetermined Winners (Sequence Rigging)</h3>
      </div>
      <p className="hint" style={{ marginBottom: 16 }}>
        Select specific tickets to win specific categories. The engine will generate a rigged number sequence using a constraint-based algorithm that runs off the main thread — the UI stays responsive during generation.
      </p>

      {bookedTickets.length === 0 ? (
        <div className="sp-loading" style={{ padding: "30px 10px", textAlign: "center", border: "1px dashed var(--border)", borderRadius: "8px" }}>
          No tickets booked yet. Please book tickets first to assign predetermined winners!
        </div>
      ) : activeRulesList.length === 0 ? (
        <div className="sp-loading" style={{ padding: "30px 10px", textAlign: "center", border: "1px dashed var(--border)", borderRadius: "8px" }}>
          No winning rules configured for this game.
        </div>
      ) : (
        <>
          {/* Impossible multi-selection warning */}
          {activeRulesList.some(rule => {
            const selectedIds = riggedWinners[rule.key] || [];
            return selectedIds.length > 1 && getSharedNumbers(tickets, selectedIds, rule.key).length === 0;
          }) && (
            <div style={{
              background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)",
              borderRadius: "8px", padding: "10px 14px", marginBottom: "16px",
              fontSize: "0.8rem", color: "#ef4444", fontWeight: "600"
            }}>
              ❌ Not Possible! Some selected tickets do not share common numbers. Please choose different tickets to ensure a simultaneous win.
            </div>
          )}

          {/* Per-rule dropdowns */}
          <div className="rigging-grid">
            {activeRulesList.map(rule => {
              const selectedIds = riggedWinners[rule.key] || [];
              const shared      = getSharedNumbers(tickets, selectedIds, rule.key);
              const isInvalid   = selectedIds.length > 1 && shared.length === 0;

              return (
                <div
                  key={rule.key}
                  style={{
                    display: "flex", flexDirection: "column", gap: "8px",
                    border: "1px solid var(--border)",
                    borderColor: isInvalid ? "rgba(239,68,68,0.35)" : "var(--border)",
                    borderRadius: "8px", padding: "12px",
                    background: isInvalid ? "rgba(239,68,68,0.02)" : "var(--bg3)",
                    transition: "border-color 0.2s ease"
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <label style={{ fontSize: "0.8rem", fontWeight: "700", color: "var(--text)" }}>
                      {rule.label}
                    </label>
                    {selectedIds.length > 1 && (
                      <div style={{ flexShrink: 0 }}>
                        {shared.length > 0 ? (
                          <span style={{ fontSize: "0.72rem", color: "#10b981", fontWeight: "600" }}>
                            ✔️ wins on {shared.join(", ")}
                          </span>
                        ) : (
                          <span style={{ fontSize: "0.72rem", color: "#ef4444", fontWeight: "600" }}>
                            ❌ Not possible
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <MultiSelectDropdown
                    options={bookedTickets}
                    selected={selectedIds}
                    onChange={next => {
                      setPreviewSeq(null);
                      setGeneratedCalls({});
                      setUnintendedWinners({});
                      setRiggedWinners(prev => ({ ...prev, [rule.key]: next }));
                    }}
                    placeholder="Select winning tickets..."
                    disabled={gameStatus === "live"}
                    footer={
                      selectedIds.length > 1 && (
                        <div style={{ padding: "8px 12px", borderTop: "1px dashed var(--border)", background: "rgba(0,0,0,0.15)", borderRadius: "0 0 8px 8px" }}>
                          {shared.length > 0 ? (
                            <div style={{ fontSize: "0.7rem", color: "#10b981", fontWeight: "600", whiteSpace: "normal", lineHeight: "1.2" }}>
                              ✔️ Perfect! Tickets win together on number {shared.join(", ")}.
                            </div>
                          ) : (
                            <div style={{ fontSize: "0.7rem", color: "#ef4444", fontWeight: "600", whiteSpace: "normal", lineHeight: "1.2" }}>
                              ❌ Not possible! These tickets do not share any common number in this category.
                            </div>
                          )}
                        </div>
                      )
                    }
                  />
                </div>
              );
            })}
          </div>

          {/* Generate / Loading / Saved button area */}
          {isSavedMode && !hasChanges ? (
            <div style={{
              background: "rgba(16,185,129,0.06)", border: "1px solid rgba(16,185,129,0.2)",
              borderRadius: "8px", padding: "12px 16px", marginBottom: "24px",
              fontSize: "0.82rem", color: "#10b981", fontWeight: "600", textAlign: "center"
            }}>
              ✔️ The saved sequence shown below is currently active in the database. To change it, select different tickets above.
            </div>
          ) : riggingLoading ? (
            /* ── Progress UI ── */
            <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginBottom: previewSeq ? "24px" : "0" }}>
              {/* Progress bar */}
              <div style={{
                height: "6px", borderRadius: "3px", background: "rgba(255,255,255,0.08)",
                overflow: "hidden", position: "relative"
              }}>
                <div style={{
                  position: "absolute", inset: "0", background: "var(--accent)",
                  animation: "riggingPulse 1.4s ease-in-out infinite",
                  transformOrigin: "left"
                }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  ⚡ {progressMsg || "Working…"}
                </span>
                <button
                  onClick={handleCancelGeneration}
                  className="admin-btn outline danger"
                  style={{ height: "32px", fontSize: "0.78rem", padding: "0 12px" }}
                >
                  ✕ Cancel
                </button>
              </div>
              <style>{`
                @keyframes riggingPulse {
                  0%   { transform: scaleX(0.15); opacity: 0.7; }
                  50%  { transform: scaleX(0.85); opacity: 1; }
                  100% { transform: scaleX(0.15); opacity: 0.7; }
                }
              `}</style>
            </div>
          ) : (
            <button
              onClick={handleGeneratePreview}
              disabled={
                !Object.values(riggedWinners).some(arr => Array.isArray(arr) && arr.length > 0) ||
                activeRulesList.some(rule => {
                  const selectedIds = riggedWinners[rule.key] || [];
                  return selectedIds.length > 1 && getSharedNumbers(tickets, selectedIds, rule.key).length === 0;
                }) ||
                gameStatus === "live"
              }
              className="admin-btn outline success sp-full-btn"
              style={{ height: "38px", marginBottom: previewSeq ? "24px" : "0px" }}
            >
              {gameStatus === "live"
                ? "Game is Live — Rigging Locked"
                : activeRulesList.some(rule => {
                    const selectedIds = riggedWinners[rule.key] || [];
                    return selectedIds.length > 1 && getSharedNumbers(tickets, selectedIds, rule.key).length === 0;
                  })
                  ? "Not Possible — Fix warnings first"
                  : "⚡ Generate Rigged Sequence"
              }
            </button>
          )}

          {/* ── Sequence Preview Card ── */}
          {displaySeq && displayWins && (() => {
            const triggerNumbers = new Set(displayWins.map(w => w.winningNumber));

            return (
              <div
                className="preview-sequence-card"
                style={isSavedMode ? { border: "1px solid rgba(16,185,129,0.4)", background: "linear-gradient(135deg,rgba(16,185,129,0.04) 0%,rgba(16,185,129,0.01) 100%)" } : {}}
              >
                <h4 className="preview-title" style={isSavedMode ? { color: "#10b981" } : {}}>
                  {isSavedMode ? "✔️ Active Rigged Sequence (Saved in Database)" : "👁️ Sequence Preview"}
                </h4>
                <p className="hint" style={{ marginBottom: 16, color: "var(--text-muted)" }}>
                  {isSavedMode
                    ? "This is the active rigging sequence currently saved in the database. The game will call numbers in this exact order."
                    : "Review the generated draw sequence below. If you like the spacing and win points, click Save & Apply. Otherwise, click Regenerate."}
                </p>

                {/* Unintended co-winners warning (from worker's constraint check) */}
                {hasUnintended && (
                  <div style={{
                    background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.25)",
                    borderRadius: "8px", padding: "10px 14px", marginBottom: "16px",
                    fontSize: "0.78rem", color: "#f59e0b", fontWeight: "600"
                  }}>
                    ⚠️ <strong>Constraint Warning:</strong>{" "}
                    {Object.entries(unintendedWinners).map(([key, labels]) =>
                      labels.length > 0 ? `${WIN_LABELS[key]}: ${labels.join(", ")} also qualifies` : null
                    ).filter(Boolean).join(" · ")}
                    {" — Try regenerating for a cleaner sequence."}
                  </div>
                )}

                {/* Win event list */}
                <div className="preview-list">
                  {displayWins.map(win => (
                    <div key={win.winType} className="preview-item" style={{ flexDirection: "column", alignItems: "stretch", gap: "6px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", flexWrap: "wrap", gap: "8px" }}>
                        <div className="preview-item-main">
                          <span className="preview-item-category">{win.label}</span>
                          <span className="preview-item-tickets">
                            for {win.ticketIds.map(id => {
                              const t = bookedTickets.find(bt => bt.id === id);
                              return t ? `${id} (${t.userName})` : id;
                            }).join(", ")}
                          </span>
                        </div>
                        <div className="preview-item-meta">
                          Wins on Call <strong className="text-orange">#{win.drawNumber}</strong>
                          {" "}(Number <strong className="text-green">{win.winningNumber}</strong>)
                        </div>
                      </div>

                      {win.coWinners && win.coWinners.length > 0 && (
                        <div style={{
                          marginTop: "4px", padding: "6px 10px",
                          background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)",
                          borderRadius: "6px", fontSize: "0.72rem", color: "#f59e0b",
                          fontWeight: "600", lineHeight: "1.3"
                        }}>
                          ⚠️ <strong>Tie Warning:</strong> Ticket{win.coWinners.length > 1 ? "s" : ""}{" "}
                          {win.coWinners.map(cw => `${cw.id} (${cw.userName})`).join(", ")}{" "}
                          will also win at this call! (Regenerate to try avoiding this).
                        </div>
                      )}
                    </div>
                  ))}
                  {displayWins.length === 0 && (
                    <div className="preview-item" style={{ fontStyle: "italic", fontSize: "0.8rem", color: "var(--text-muted)", justifyContent: "center" }}>
                      No winning categories rigged.
                    </div>
                  )}
                </div>

                {/* Full 90-number sequence grid */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", margin: "20px 0 8px 0", flexWrap: "wrap", gap: "8px" }}>
                  <h5 style={{ fontSize: "0.82rem", fontWeight: "700", margin: 0, color: "var(--text)" }}>
                    🔢 Full Draw Sequence (90 Numbers)
                  </h5>
                  <div style={{ display: "flex", gap: "12px", fontSize: "0.72rem", color: "var(--text-muted)", alignItems: "center" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "var(--accent)" }}></span> Trigger
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "rgba(16, 185, 129, 0.35)", border: "1px solid #10b981" }}></span> Called ({game?.calledNumbers?.length || 0})
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                      <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "rgba(255, 255, 255, 0.05)", border: "1px solid rgba(255, 255, 255, 0.2)" }}></span> Upcoming
                    </span>
                  </div>
                </div>

                <div style={{
                  display: "flex", flexWrap: "wrap", gap: "6px",
                  background: "var(--bg)", border: "1px solid var(--border)",
                  borderRadius: "8px", padding: "12px", marginBottom: "16px"
                }}>
                  {(() => {
                    const calledSet = new Set(game?.calledNumbers || []);
                    return displaySeq.map((num, idx) => {
                      const isTrigger  = triggerNumbers.has(num);
                      const isCalled   = calledSet.has(num);
                      const winsOnThis = displayWins.filter(w => w.winningNumber === num).map(w => w.label);

                      let bg = "rgba(255,255,255,0.05)";
                      let color = "var(--text)";
                      let border = "1px solid rgba(255,255,255,0.1)";
                      let opacity = 0.65;
                      let boxShadow = "none";

                      if (isTrigger && isCalled) {
                        bg = "#10b981";
                        color = "#000";
                        border = "none";
                        opacity = 1;
                        boxShadow = "0 0 8px rgba(16, 185, 129, 0.6)";
                      } else if (isTrigger) {
                        bg = "var(--accent)";
                        color = "#000";
                        border = "none";
                        opacity = 1;
                      } else if (isCalled) {
                        bg = "rgba(16, 185, 129, 0.2)";
                        color = "#10b981";
                        border = "1px solid rgba(16, 185, 129, 0.45)";
                        opacity = 1;
                      }

                      return (
                        <div
                          key={idx}
                          title={`${winsOnThis.length > 0 ? `Wins: ${winsOnThis.join(", ")} | ` : ""}Call #${idx + 1}: ${num}${isCalled ? " (Called)" : ""}`}
                          style={{
                            display: "flex", alignItems: "center", justifyContent: "center",
                            width: "28px", height: "28px", borderRadius: "50%",
                            fontSize: "0.75rem", fontWeight: "700", flexShrink: 0, cursor: "help",
                            background: bg,
                            color: color,
                            border: border,
                            opacity: opacity,
                            boxShadow: boxShadow,
                            transition: "all 0.2s ease",
                          }}
                        >
                          {num}
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* Action buttons */}
                <div className="preview-actions">
                  {isSavedMode ? (
                    <>
                      <button
                        onClick={handleGeneratePreview}
                        disabled={gameStatus === "live" || riggingLoading}
                        className="admin-btn outline primary"
                        style={{ flex: 1, height: "38px" }}
                      >
                        ↻ Regenerate New Sequence
                      </button>
                      <button
                        onClick={handleClearRigging}
                        disabled={riggingLoading || gameStatus === "live"}
                        className="admin-btn outline danger"
                        style={{ flex: 1, height: "38px" }}
                      >
                        ✕ Clear Rigging
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={handleSavePreview}
                        disabled={riggingLoading || gameStatus === "live"}
                        className="admin-btn outline success"
                        style={{ flex: 1, height: "38px" }}
                      >
                        ✔️ Save &amp; Apply Sequence
                      </button>
                      <button
                        onClick={handleGeneratePreview}
                        disabled={gameStatus === "live" || riggingLoading}
                        className="admin-btn outline"
                        style={{ flex: 1, height: "38px" }}
                      >
                        ↻ Regenerate
                      </button>
                      <button
                        onClick={() => { setPreviewSeq(null); setPreviewWins(null); setGeneratedCalls({}); setUnintendedWinners({}); }}
                        disabled={gameStatus === "live"}
                        className="admin-btn outline danger"
                        style={{ height: "38px" }}
                      >
                        ✕ Cancel
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })()}
        </>
      )}
    </div>
  );
}
