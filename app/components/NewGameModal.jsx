"use client";
// app/admin/components/NewGameModal.jsx
import { useState } from "react";

const RULE_CONFIG = [
  { key: "topLine",    label: "Top Line",    icon: "🎯", desc: "First row of a ticket fully marked" },
  { key: "middleLine", label: "Middle Line", icon: "🎯", desc: "Second row of a ticket fully marked" },
  { key: "lastLine",   label: "Last Line",   icon: "🎯", desc: "Third row of a ticket fully marked" },
  { key: "quickSeven", label: "Quick 7",     icon: "⚡", desc: "First ticket to have 7 numbers called wins" },
];

export default function NewGameModal({ open, onConfirm, onCancel }) {
  const [ticketCount, setTicketCount] = useState(50);
  const [sheetSize, setSheetSize]     = useState(6);
  const [rules, setRules] = useState({
    topLine: true, middleLine: true, lastLine: true, quickSeven: true,
  });
  const [error, setError] = useState("");

  if (!open) return null;

  function toggleRule(key) {
    setRules(r => ({ ...r, [key]: !r[key] }));
  }

  function handleConfirm() {
    setError("");
    const count = parseInt(ticketCount, 10);
    const size  = parseInt(sheetSize, 10);
    if (isNaN(count) || count < 1 || count > 500) {
      setError("Ticket count must be between 1 and 500.");
      return;
    }
    if (isNaN(size) || size < 2 || size > 9) {
      setError("Sheet size must be between 2 and 9.");
      return;
    }
    onConfirm({ ticketCount: count, sheetSize: size, rules: { ...rules, fullHouse: true } });
  }

  const totalSheets = Math.ceil((parseInt(ticketCount) || 0) / (parseInt(sheetSize) || 6));
  const activeRules = RULE_CONFIG.filter(r => rules[r.key]).map(r => r.label);
  activeRules.push("Full House");

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-box ngm-box" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="ngm-header">
          <div className="ngm-header-icon">⚙️</div>
          <div>
            <h2 className="ngm-title">New Game Setup</h2>
            <p className="ngm-subtitle">Configure tickets and winning rules before starting</p>
          </div>
        </div>

        <div className="ngm-section-wrapper">
        {/* Ticket config */}
        <div className="ngm-section">
          <h3 className="ngm-section-title">Ticket Configuration</h3>
          <div className="ngm-fields">
            <div className="ngm-field">
              <label className="ngm-label">Number of Tickets</label>
              <div className="ngm-input-row">
                <button className="ngm-stepper" onClick={() => setTicketCount(c => Math.max(1, +c - 1))}>−</button>
                <input
                  type="number" min="1" max="500"
                  value={ticketCount}
                  onChange={e => setTicketCount(e.target.value)}
                  className="admin-input ngm-number-input"
                />
                <button className="ngm-stepper" onClick={() => setTicketCount(c => Math.min(500, +c + 1))}>+</button>
              </div>
            </div>
            <div className="ngm-field">
              <label className="ngm-label">Tickets per Sheet</label>
              <div className="ngm-input-row">
                <button className="ngm-stepper" onClick={() => setSheetSize(s => Math.max(2, +s - 1))}>−</button>
                <input
                  type="number" min="2" max="9"
                  value={sheetSize}
                  onChange={e => setSheetSize(e.target.value)}
                  className="admin-input ngm-number-input"
                />
                <button className="ngm-stepper" onClick={() => setSheetSize(s => Math.min(9, +s + 1))}>+</button>
              </div>
              <p className="ngm-field-hint">Numbers won't repeat within a sheet (max 9)</p>
            </div>
          </div>
          <div className="ngm-summary">
            <span className="ngm-summary-item"><strong>{ticketCount}</strong> tickets</span>
            <span className="ngm-summary-dot">·</span>
            <span className="ngm-summary-item"><strong>{totalSheets}</strong> sheet{totalSheets !== 1 ? "s" : ""}</span>
            <span className="ngm-summary-dot">·</span>
            <span className="ngm-summary-item">up to <strong>{sheetSize}</strong> per sheet</span>
          </div>
        </div>

        {/* Game rules */}
        <div className="ngm-section">
          <h3 className="ngm-section-title">Winning Categories</h3>
          <p className="ngm-section-hint">Toggle which categories can win prizes in this game</p>

          <div className="ngm-rules">
            {RULE_CONFIG.map(rule => (
              <div
                key={rule.key}
                className={`ngm-rule ${rules[rule.key] ? "active" : ""}`}
                onClick={() => toggleRule(rule.key)}
              >
                <div className="ngm-rule-left">
                  <span className="ngm-rule-icon">{rule.icon}</span>
                  <div>
                    <div className="ngm-rule-label">{rule.label}</div>
                    <div className="ngm-rule-desc">{rule.desc}</div>
                  </div>
                </div>
                <div className={`ngm-toggle ${rules[rule.key] ? "on" : "off"}`}>
                  <div className="ngm-toggle-thumb" />
                </div>
              </div>
            ))}

            {/* Full House — always on */}
            <div className="ngm-rule always-on">
              <div className="ngm-rule-left">
                <span className="ngm-rule-icon">🏆</span>
                <div>
                  <div className="ngm-rule-label">Full House</div>
                  <div className="ngm-rule-desc">All three rows marked — always enabled</div>
                </div>
              </div>
              <div className="ngm-toggle on locked">
                <div className="ngm-toggle-thumb" />
              </div>
            </div>
          </div>

          {/* Active prizes summary */}
          <div className="ngm-active-rules">
            <span className="ngm-active-label">Active prizes:</span>
            {activeRules.map(r => (
              <span key={r} className="ngm-active-chip">{r}</span>
            ))}
          </div>
        </div>
        </div>

        {error && <p className="error-msg" style={{ padding: "0 24px 12px" }}>{error}</p>}

        {/* Actions */}
        <div className="ngm-actions">
          <button onClick={onCancel} className="admin-btn outline">Cancel</button>
          <button onClick={handleConfirm} className="admin-btn primary ngm-confirm-btn">
            ⚙️ Create Game
          </button>
        </div>

      </div>
    </div>
  );
}