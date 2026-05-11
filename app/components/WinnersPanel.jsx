"use client";
// components/WinnersPanel.jsx
import { useState, useEffect, useRef } from "react";
import { WIN_TYPES, WIN_LABELS } from "../lib/tambola";

export default function WinnersPanel({ winners = {}, gameRules = {} }) {
  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(false);
  const prevWinCount = useRef(0);

  // Only show rule types that are active in this game
  const activeTypes = WIN_TYPES.filter(t => gameRules[t] !== false);

  const winCount = activeTypes.filter(t => winners[t]).length;
  const hasAnyWinner = winCount > 0;
  const hasFullHouse = !!winners.fullHouse;

  useEffect(() => {
    if (winCount > prevWinCount.current) {
      setPulse(true);
      setOpen(true);
      const t = setTimeout(() => setPulse(false), 3000);
      prevWinCount.current = winCount;
      return () => clearTimeout(t);
    }
    prevWinCount.current = winCount;
  }, [winCount]);

  return (
    <>
      <button
        className={`winners-fab ${pulse ? "winners-fab-pulse" : ""} ${hasFullHouse ? "winners-fab-gold" : hasAnyWinner ? "winners-fab-active" : ""}`}
        onClick={() => setOpen(o => !o)}
        aria-label="Toggle winners panel"
      >
        <span className="winners-fab-icon">🏆</span>
        <span className="winners-fab-label">
          {hasAnyWinner ? `${winCount} Winner${winCount > 1 ? "s" : ""}` : "Winners"}
        </span>
        {hasAnyWinner && (
          <span className="winners-fab-badge">{winCount}</span>
        )}
        <span className={`winners-fab-arrow ${open ? "up" : "down"}`}>▲</span>
        {pulse && <span className="winners-pulse-ring" />}
      </button>

      {/* Backdrop — closes on outside click, won't interfere with panel clicks */}
      {open && (
        <div className="winners-backdrop" onClick={() => setOpen(false)} />
      )}

      {/* Panel — stop propagation so clicks inside don't hit backdrop */}
      <div
        className={`winners-dropdown ${open ? "winners-dropdown-open" : ""}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="winners-dropdown-header">
          <span className="winners-dropdown-title">🏆 Winners</span>
          <button
            className="winners-dropdown-close"
            onClick={() => setOpen(false)}
          >
            ✕
          </button>
        </div>

        <div className="winners-list">
          {activeTypes.map((type) => {
            const w = winners[type]; // now an array or undefined
            const winList = Array.isArray(w) ? w : w ? [w] : []; // handle both old & new format
            return (
              <div key={type} className={`winner-row ${winList.length ? "won" : "pending"}`}>
                <span className="win-type">{WIN_LABELS[type]}</span>
                {winList.length ? (
                  <span className="win-user">
                    {winList.map((winner, i) => (
                      <span key={i}>
                        <strong>{winner.userName}</strong>
                        <small>({winner.ticketId})</small>
                        {i < winList.length - 1 ? " · " : ""}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span className="win-empty">—</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}