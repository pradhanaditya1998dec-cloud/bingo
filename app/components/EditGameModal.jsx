"use client";
import { useState, useEffect } from "react";

const RULE_CONFIG = [
  { key: "topLine", label: "Top Line", icon: "🎯", desc: "First row of a ticket fully marked" },
  { key: "middleLine", label: "Middle Line", icon: "🎯", desc: "Second row of a ticket fully marked" },
  { key: "lastLine", label: "Last Line", icon: "🎯", desc: "Third row of a ticket fully marked" },
  { key: "corners", label: "Corners", icon: "🔶", desc: "Top row first and last, plus bottom row first and last" },
  { key: "quickSeven", label: "Quick 7", icon: "⚡", desc: "First ticket to have 7 numbers called wins" },
  { key: "secondFullHouse", label: "2nd Full House", icon: "🏆", desc: "Adds a second full house prize and ends the game only after that winner" },
];

export default function EditGameModal({ open, game, onConfirm, onCancel }) {
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
    topLine: true,
    middleLine: true,
    lastLine: true,
    corners: false,
    quickSeven: true,
    secondFullHouse: false,
  });
  const [error, setError] = useState("");

  useEffect(() => {
    if (game && open) {
      setRules({
        topLine: game.rules?.topLine ?? false,
        middleLine: game.rules?.middleLine ?? false,
        lastLine: game.rules?.lastLine ?? false,
        corners: game.rules?.corners ?? false,
        quickSeven: game.rules?.quickSeven ?? false,
        secondFullHouse: game.rules?.secondFullHouse ?? false,
      });
      setRulePrices({
        topLine: game.prizes?.topLine !== undefined ? String(game.prizes.topLine) : "",
        middleLine: game.prizes?.middleLine !== undefined ? String(game.prizes.middleLine) : "",
        lastLine: game.prizes?.lastLine !== undefined ? String(game.prizes.lastLine) : "",
        corners: game.prizes?.corners !== undefined ? String(game.prizes.corners) : "",
        quickSeven: game.prizes?.quickSeven !== undefined ? String(game.prizes.quickSeven) : "",
        secondFullHouse: game.prizes?.secondFullHouse !== undefined ? String(game.prizes.secondFullHouse) : "",
        fullHouse: game.prizes?.fullHouse !== undefined ? String(game.prizes.fullHouse) : "",
      });
      setError("");
    }
  }, [game, open]);

  if (!open) return null;

  function toggleRule(key) {
    setRules((r) => ({ ...r, [key]: !r[key] }));
  }

  function handlePriceChange(key, val) {
    setRulePrices((prev) => ({ ...prev, [key]: val }));
  }

  function handleConfirm() {
    setError("");

    // Convert rule prices to numbers or null/0
    const parsedPrices = {};
    Object.keys(rulePrices).forEach((key) => {
      const isRuleActive = key === "fullHouse" || rules[key];
      const pVal = rulePrices[key];
      parsedPrices[key] = isRuleActive && pVal !== "" ? parseFloat(pVal) || 0 : 0;
    });

    onConfirm({
      prizes: parsedPrices,
      rules: { ...rules, fullHouse: true }
    });
  }

  const activeRules = RULE_CONFIG.filter((r) => rules[r.key]).map((r) => r.label);
  activeRules.push("Full House");

  const isSaveDisabled = () => {
    // Active rules (including Full House) must have pricing entered
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
      <div className="modal-box ngm-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px" }}>
        <div className="ngm-header">
          <div className="ngm-header-icon">✏️</div>
          <div>
            <h2 className="ngm-title">Edit Game Prizes & Rules</h2>
            <p className="ngm-subtitle">Update winning categories and prize pools for this game</p>
          </div>
        </div>

        <div className="ngm-section-wrapper" style={{ padding: "0 24px" }}>
          <div className="ngm-section" style={{ width: "100%", borderRight: "none" }}>
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

            <div className="ngm-active-rules" style={{ marginTop: "14px" }}>
              <span className="ngm-active-label">Active prizes:</span>
              {activeRules.map((r) => (
                <span key={r} className="ngm-active-chip">{r}</span>
              ))}
            </div>
          </div>
        </div>

        {error && <p className="error-msg" style={{ padding: "0 24px 12px" }}>{error}</p>}

        <div className="ngm-actions" style={{ marginTop: "14px" }}>
          <button onClick={onCancel} className="admin-btn outline">Cancel</button>
          <button 
            onClick={handleConfirm} 
            className="admin-btn primary ngm-confirm-btn"
            disabled={isSaveDisabled()}
          >
             Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
