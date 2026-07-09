"use client";
// app/admin/components/NewGameModal.jsx
import { useState } from "react";

const RULE_CONFIG = [
  { key: "topLine", label: "Top Line", icon: "🎯", desc: "First row of a ticket fully marked" },
  { key: "middleLine", label: "Middle Line", icon: "🎯", desc: "Second row of a ticket fully marked" },
  { key: "lastLine", label: "Last Line", icon: "🎯", desc: "Third row of a ticket fully marked" },
  { key: "corners", label: "Corners", icon: "🔶", desc: "Top row first and last, plus bottom row first and last" },
  { key: "quickSeven", label: "Quick 7", icon: "⚡", desc: "First ticket to have 7 numbers called wins" },
  { key: "secondFullHouse", label: "2nd Full House", icon: "🏆", desc: "Adds a second full house prize and ends the game only after that winner" },
];

export default function NewGameModal({ open, onConfirm, onCancel }) {
  const [ticketCount, setTicketCount] = useState(50);
  const [sheetSize, setSheetSize] = useState(6);
  const [ticketPrice, setTicketPrice] = useState("");
  const [rulePrices, setRulePrices] = useState({
    topLine: "",
    middleLine: "",
    lastLine: "",
    corners: "",
    quickSeven: "",
    secondFullHouse: "",
    fullHouse: "",
  });
  const [rules, setRules] = useState({
    topLine: true, middleLine: true, lastLine: true, corners: false, quickSeven: true, secondFullHouse: false,
  });
  const [error, setError] = useState("");

  if (!open) return null;

  function toggleRule(key) {
    setRules((r) => ({ ...r, [key]: !r[key] }));
  }

  function handlePriceChange(key, val) {
    setRulePrices((prev) => ({ ...prev, [key]: val }));
  }

  function handleConfirm() {
    setError("");
    const count = parseInt(ticketCount, 10);
    if (isNaN(count) || count < 1 || count > 500) {
      setError("Ticket count must be between 1 and 500.");
      return;
    }
    const price = ticketPrice === "" ? null : parseFloat(ticketPrice);
    if (ticketPrice !== "" && (isNaN(price) || price < 0)) {
      setError("Ticket price must be a valid positive number.");
      return;
    }

    // Convert rule prices to numbers or null/0
    const parsedPrices = {};
    Object.keys(rulePrices).forEach((key) => {
      const isRuleActive = key === "fullHouse" || rules[key];
      const pVal = rulePrices[key];
      parsedPrices[key] = isRuleActive && pVal !== "" ? parseFloat(pVal) || 0 : 0;
    });

    onConfirm({
      ticketCount: count,
      sheetSize,
      ticketPrice: price,
      prizes: parsedPrices,
      rules: { ...rules, fullHouse: true }
    });
  }

  const totalSheets = Math.ceil((parseInt(ticketCount, 10) || 0) / (parseInt(sheetSize, 10) || 6));
  const activeRules = RULE_CONFIG.filter((r) => rules[r.key]).map((r) => r.label);
  activeRules.push("Full House");

  const isCreateDisabled = () => {
    // 1. Ticket Price must be entered and valid
    if (ticketPrice === "" || isNaN(parseFloat(ticketPrice)) || parseFloat(ticketPrice) <= 0) {
      return true;
    }
    
    // 2. Active rules (including Full House) must have pricing entered
    const activeRuleKeys = Object.keys(rules).filter(k => rules[k]);
    activeRuleKeys.push("fullHouse");
    
    for (const key of activeRuleKeys) {
      const priceVal = rulePrices[key];
      if (priceVal === "" || isNaN(parseFloat(priceVal)) || parseFloat(priceVal) <= 0) {
        return true;
      }
    }
    
    return false;
  };

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-box ngm-box" onClick={(e) => e.stopPropagation()}>
        <div className="ngm-header">
          <div className="ngm-header-icon">⚙️</div>
          <div>
            <h2 className="ngm-title">New Game Setup</h2>
            <p className="ngm-subtitle">Configure tickets and winning rules before starting</p>
          </div>
        </div>

        <div className="ngm-section-wrapper">
          <div className="ngm-section">
            <h3 className="ngm-section-title">Ticket Configuration</h3>
            <div className="ngm-field" style={{ marginBottom: 14 }}>
              <label className="ngm-label">Number of Tickets</label>
              <div className="ngm-input-row">
                <button className="ngm-stepper" onClick={() => setTicketCount((c) => Math.max(1, +c - 1))}>-</button>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={ticketCount}
                  onChange={(e) => setTicketCount(e.target.value)}
                  className="admin-input ngm-number-input-full"
                />
                <button className="ngm-stepper" onClick={() => setTicketCount((c) => Math.min(500, +c + 1))}>+</button>
              </div>
            </div>

            <div className="ngm-field">
              <label className="ngm-label">Ticket Price (₹)</label>
              <div className="price-input-container">
                <span className="ngm-currency">₹</span>
                <input
                  type="number"
                  min="0"
                  placeholder="e.g. 50"
                  value={ticketPrice}
                  onChange={(e) => setTicketPrice(e.target.value)}
                  className="ngm-price-input"
                />
              </div>
            </div>
          </div>

          <div className="ngm-section">
            <h3 className="ngm-section-title">Winning Categories</h3>

            <div className="ngm-rules">
              {RULE_CONFIG.map((rule) => (
                <div
                  key={rule.key}
                  className={`ngm-rule ${rules[rule.key] ? "active" : ""}`}
                >
                  <div className="ngm-rule-top" onClick={() => toggleRule(rule.key)}>
                    <div className="ngm-rule-left">
                      <span className="ngm-rule-icon">{rule.icon}</span>
                      <div className="ngm-rule-label">{rule.label}</div>
                    </div>
                    <div className={`ngm-toggle ${rules[rule.key] ? "on" : "off"}`}>
                      <div className="ngm-toggle-thumb" />
                    </div>
                  </div>

                  {rules[rule.key] && (
                    <div className="ngm-rule-bottom" onClick={(e) => e.stopPropagation()}>
                      <div className="ngm-rule-price-input-wrap">
                        <span className="ngm-rule-price-symbol">Prize: ₹</span>
                        <input
                          type="number"
                          min="0"
                          placeholder="Enter prize amount"
                          value={rulePrices[rule.key]}
                          onChange={(e) => handlePriceChange(rule.key, e.target.value)}
                          className="ngm-rule-price-input"
                        />
                      </div>
                    </div>
                  )}
                </div>
              ))}

              <div className="ngm-rule always-on">
                <div className="ngm-rule-top">
                  <div className="ngm-rule-left">
                    <span className="ngm-rule-icon">🏆</span>
                    <div className="ngm-rule-label">Full House</div>
                  </div>
                  <div className="ngm-toggle on locked">
                    <div className="ngm-toggle-thumb" />
                  </div>
                </div>

                <div className="ngm-rule-bottom" onClick={(e) => e.stopPropagation()}>
                  <div className="ngm-rule-price-input-wrap">
                    <span className="ngm-rule-price-symbol">Prize: ₹</span>
                    <input
                      type="number"
                      min="0"
                      placeholder="Enter prize amount"
                      value={rulePrices.fullHouse}
                      onChange={(e) => handlePriceChange("fullHouse", e.target.value)}
                      className="ngm-rule-price-input"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="ngm-active-rules">
              <span className="ngm-active-label">Active prizes:</span>
              {activeRules.map((r) => (
                <span key={r} className="ngm-active-chip">{r}</span>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="error-msg" style={{ padding: "0 24px 12px" }}>{error}</p>}

        <div className="ngm-actions">
          <button onClick={onCancel} className="admin-btn outline">Cancel</button>
          <button 
            onClick={handleConfirm} 
            className="admin-btn primary ngm-confirm-btn"
            disabled={isCreateDisabled()}
          >
             Create Game
          </button>
        </div>
      </div>
    </div>
  );
}
