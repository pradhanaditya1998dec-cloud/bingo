"use client";
import { useState, useEffect, useMemo, useRef } from "react";
import { saveRiggedWinners } from "../lib/gameStore";
import { WIN_LABELS, generateRiggedSequence, getSharedNumbers, reconstructGrid } from "../lib/tambola";

// Custom Multi-Select Dropdown with Checkboxes
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

export default function RiggingTab({ gameId, game, tickets = {}, bookedTickets = [], gameStatus, onSuccess }) {
  const [riggedWinners, setRiggedWinners] = useState({});
  const [riggingLoading, setRiggingLoading] = useState(false);
  const [previewSeq, setPreviewSeq] = useState(null);
  const [previewWins, setPreviewWins] = useState(null);

  // Initialize rigged winners from game document
  useEffect(() => {
    if (game?.riggedWinners) {
      const normalized = {};
      Object.entries(game.riggedWinners).forEach(([k, v]) => {
        normalized[k] = Array.isArray(v) ? v : [v].filter(Boolean);
      });
      setRiggedWinners(normalized);
    }
  }, [game]);

  // List all rules configured for the game
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
      return !s1.every((val, index) => val === s2[index]);
    });
  }, [game, riggedWinners]);

  // Calculate when each category wins in the sequence
  function getSequenceWins(tickets, riggedWinnersMap, seq) {
    const wins = [];
    const called = new Set();
    const wonCategories = new Set();

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

    for (let i = 0; i < seq.length; i++) {
      const num = seq[i];
      called.add(num);
      
      Object.entries(riggedWinnersMap).forEach(([winType, ticketIds]) => {
        if (wonCategories.has(winType)) return;
        if (!ticketIds || ticketIds.length === 0) return;
        
        const allWon = ticketIds.every(id => {
          const ticket = tickets[id];
          if (!ticket) return false;
          const req = getRequiredNumbers(ticket, winType);
          return req.every(n => called.has(n));
        });
        
        if (allWon) {
          wonCategories.add(winType);

          const coWinners = [];
          Object.values(tickets).forEach(t => {
            if (t.status !== "booked") return;
            if (ticketIds.includes(t.id)) return;
            const req = getRequiredNumbers(t, winType);
            if (req.length > 0 && req.every(n => called.has(n))) {
              coWinners.push({ id: t.id, userName: t.userName });
            }
          });

          wins.push({
            winType,
            label: WIN_LABELS[winType] || winType,
            drawNumber: i + 1,
            winningNumber: num,
            ticketIds,
            coWinners
          });
        }
      });
    }
    return wins;
  }

  const savedWins = useMemo(() => {
    if (!game?.riggedSequence || !game?.riggedWinners) return null;
    const normalized = {};
    Object.entries(game.riggedWinners).forEach(([k, v]) => {
      normalized[k] = Array.isArray(v) ? v : [v].filter(Boolean);
    });
    return getSequenceWins(tickets, normalized, game.riggedSequence);
  }, [game, tickets]);

  // Generates preview sequence locally without writing to DB
  function handleGeneratePreview() {
    try {
      const seq = generateRiggedSequence(tickets, riggedWinners, game.rules);
      const wins = getSequenceWins(tickets, riggedWinners, seq);
      setPreviewSeq(seq);
      setPreviewWins(wins);
    } catch (e) {
      alert("Failed to generate sequence: " + e.message);
    }
  }

  async function handleSavePreview() {
    if (!previewSeq) return;
    setRiggingLoading(true);
    try {
      await saveRiggedWinners(gameId, riggedWinners, previewSeq);
      onSuccess?.("🔮 Predetermined winners sequence applied and saved successfully!");
      setPreviewSeq(null);
      setPreviewWins(null);
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
      onSuccess?.("🔮 Sequence rigging cleared! The game is now set to normal random draw.");
    } catch (e) {
      alert("Failed to clear rigging: " + e.message);
    } finally {
      setRiggingLoading(false);
    }
  }

  const isSavedMode = !previewSeq && !!game?.riggedSequence && !!game?.riggedWinners;
  const displaySeq = previewSeq || game?.riggedSequence || null;
  const displayWins = previewSeq ? previewWins : savedWins;

  if (!gameId) return <div className="sp-loading">No active game selected. Create or select a game first!</div>;

  return (
    <div className="sp-section">
      <div className="sp-section-header">
        <h3 className="sp-section-title">🔮 Predetermined Winners (Sequence Rigging)</h3>
      </div>
      <p className="hint" style={{ marginBottom: 16 }}>
        Select specific tickets to win specific categories. The auto-draw engine will generate a sequence of numbers to satisfy these wins in order, spaced out naturally by random numbers.
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
          {activeRulesList.some(rule => {
            const selectedIds = riggedWinners[rule.key] || [];
            return selectedIds.length > 1 && getSharedNumbers(tickets, selectedIds, rule.key).length === 0;
          }) && (
            <div style={{
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.25)",
              borderRadius: "8px",
              padding: "10px 14px",
              marginBottom: "16px",
              fontSize: "0.8rem",
              color: "#ef4444",
              fontWeight: "600"
            }}>
              ❌ Not Possible! Some selected tickets do not share common numbers. Please choose different tickets to ensure a simultaneous win.
            </div>
          )}

          <div className="rigging-grid">
            {activeRulesList.map(rule => {
              const selectedIds = riggedWinners[rule.key] || [];
              const shared = getSharedNumbers(tickets, selectedIds, rule.key);
              const isInvalid = selectedIds.length > 1 && shared.length === 0;

              return (
                <div
                  key={rule.key}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    border: "1px solid var(--border)",
                    borderColor: isInvalid ? "rgba(239, 68, 68, 0.35)" : "var(--border)",
                    borderRadius: "8px",
                    padding: "12px",
                    background: isInvalid ? "rgba(239, 68, 68, 0.02)" : "var(--bg3)",
                    transition: "border-color 0.2s ease"
                  }}
                >
                  {/* Card Header: Label on Left, short feedback on Right */}
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

                  {/* Dropdown with checkbox list */}
                  <MultiSelectDropdown
                    options={bookedTickets}
                    selected={selectedIds}
                    onChange={next => {
                      setPreviewSeq(null); // clear preview if selection changes
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

          {isSavedMode && !hasChanges ? (
            <div style={{
              background: "rgba(16, 185, 129, 0.06)",
              border: "1px solid rgba(16, 185, 129, 0.2)",
              borderRadius: "8px",
              padding: "12px 16px",
              marginBottom: "24px",
              fontSize: "0.82rem",
              color: "#10b981",
              fontWeight: "600",
              textAlign: "center"
            }}>
              ✔️ The saved sequence shown below is currently active in the database. To change it, select different tickets above.
            </div>
          ) : (
            <button
              onClick={handleGeneratePreview}
              disabled={
                riggingLoading || 
                gameStatus === "live" ||
                !Object.values(riggedWinners).some(arr => Array.isArray(arr) && arr.length > 0) ||
                activeRulesList.some(rule => {
                  const selectedIds = riggedWinners[rule.key] || [];
                  return selectedIds.length > 1 && getSharedNumbers(tickets, selectedIds, rule.key).length === 0;
                })
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
                    : riggingLoading
                      ? "Applying Draw Sequence…"
                      : "Preview Rigged Sequence"}
            </button>
          )}

          {/* ── Sequence Preview Card (Rendered below main button) ── */}
          {displaySeq && displayWins && (() => {
            const triggerNumbers = new Set(displayWins.map(w => w.winningNumber));

            return (
              <div className="preview-sequence-card" style={isSavedMode ? { border: "1px solid rgba(16, 185, 129, 0.4)", background: "linear-gradient(135deg, rgba(16, 185, 129, 0.04) 0%, rgba(16, 185, 129, 0.01) 100%)" } : {}}>
                <h4 className="preview-title" style={isSavedMode ? { color: "#10b981" } : {}}>
                  {isSavedMode ? "✔️ Active Rigged Sequence (Saved in Database)" : "👁️ Sequence Preview Details"}
                </h4>
                <p className="hint" style={{ marginBottom: 16, color: "var(--text-muted)" }}>
                  {isSavedMode 
                    ? "This is the active rigging sequence currently saved in the database. The game will call numbers in this exact order." 
                    : "Review the generated draw sequence below. If you like the spacing and win points, click Save & Apply Sequence. Otherwise, click Regenerate."
                  }
                </p>
                
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
                          Wins on Call <strong className="text-orange">#{win.drawNumber}</strong> (Number <strong className="text-green">{win.winningNumber}</strong>)
                        </div>
                      </div>

                      {win.coWinners && win.coWinners.length > 0 && (
                        <div style={{
                          marginTop: "4px",
                          padding: "6px 10px",
                          background: "rgba(245, 158, 11, 0.08)",
                          border: "1px solid rgba(245, 158, 11, 0.2)",
                          borderRadius: "6px",
                          fontSize: "0.72rem",
                          color: "#f59e0b",
                          fontWeight: "600",
                          lineHeight: "1.3"
                        }}>
                          ⚠️ <strong>Tie Warning:</strong> Ticket{win.coWinners.length > 1 ? "s" : ""} {win.coWinners.map(cw => `${cw.id} (${cw.userName})`).join(", ")} will also win at the exact same call! (Regenerate to try avoiding this).
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

                {/* ── 90-Number Sequence Grid ── */}
                <h5 style={{ fontSize: "0.82rem", fontWeight: "700", margin: "20px 0 8px 0", color: "var(--text)" }}>
                  🔢 Full Draw Sequence (90 Numbers)
                </h5>
                <div style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "6px",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: "8px",
                  padding: "12px",
                  marginBottom: "16px"
                }}>
                  {displaySeq.map((num, idx) => {
                    const isTrigger = triggerNumbers.has(num);
                    const winsOnThisNum = displayWins.filter(w => w.winningNumber === num).map(w => w.label);
                    
                    return (
                      <div
                        key={idx}
                        title={winsOnThisNum.length > 0 ? `Wins: ${winsOnThisNum.join(", ")}` : `Call #${idx + 1}`}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          width: "28px",
                          height: "28px",
                          borderRadius: "50%",
                          fontSize: "0.75rem",
                          fontWeight: "700",
                          background: isTrigger ? "var(--accent)" : "rgba(255, 255, 255, 0.05)",
                          color: isTrigger ? "#000" : "var(--text)",
                          border: isTrigger ? "none" : "1px solid rgba(255, 255, 255, 0.1)",
                          cursor: "help",
                          flexShrink: 0
                        }}
                      >
                        {num}
                      </div>
                    );
                  })}
                </div>

                <div className="preview-actions">
                  {isSavedMode ? (
                    <>
                      <button
                        onClick={handleGeneratePreview}
                        disabled={gameStatus === "live"}
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
                        ✔️ Save & Apply Sequence
                      </button>
                      <button
                        onClick={handleGeneratePreview}
                        disabled={gameStatus === "live"}
                        className="admin-btn outline"
                        style={{ flex: 1, height: "38px" }}
                      >
                        ↻ Regenerate
                      </button>
                      <button
                        onClick={() => { setPreviewSeq(null); setPreviewWins(null); }}
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
